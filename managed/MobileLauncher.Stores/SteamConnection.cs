using System.Security.Cryptography;
using SteamKit2;
using SteamKit2.Authentication;
using SteamKit2.Discovery;

namespace MobileLauncher.Stores;

internal readonly record struct SteamRoute(ProtocolTypes Protocol, bool Bootstrap = false)
{
    public string Label => (Protocol == ProtocolTypes.Tcp ? "TCP" : "WebSocket") + (Bootstrap ? " · 备用节点" : "");
}

internal sealed class SteamConnectionException(string message, bool retryable = true) : IOException(message)
{
    public bool Retryable { get; } = retryable;
}

internal sealed record SteamTokens(string Account, string RefreshToken);

internal interface ISteamConnection : IDisposable
{
    SteamClient Client { get; }
    bool IsConnected { get; }
    event Action<SteamConnectionException>? Disconnected;
    Task ConnectAsync(CancellationToken ct);
    Task<SteamTokens> AuthenticateAsync(string username, string password, IAuthenticator authenticator, CancellationToken ct);
    Task LogOnAsync(string username, string token, CancellationToken ct);
    Task LogOnAnonymousAsync(CancellationToken ct);
    Task<bool> OwnsTerrariaAsync(CancellationToken ct);
}

/** A connection owns its callbacks/waiters; an old disconnect cannot fail a new attempt. */
internal sealed class SteamConnection : ISteamConnection, IDebugListener
{
    private readonly string identifier = "tml-" + Guid.NewGuid().ToString("N");
    private readonly SteamRoute route;
    private readonly SteamUser user;
    private readonly CallbackManager callbacks;
    private readonly CancellationTokenSource lifetime = new();
    private readonly CancellationTokenSource lost = new();
    private readonly TaskCompletionSource<bool> connected = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly TaskCompletionSource<SteamUser.LoggedOnCallback> loggedOn = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly List<IDisposable> subscriptions = [];
    private readonly uint loginId = BitConverter.ToUInt32(RandomNumberGenerator.GetBytes(4)) | 0x80000000;
    private volatile string diagnostic = "CM 连接失败";
    private SteamConnectionException? disconnectReason;
    private int disposed;
    public SteamClient Client { get; }
    public bool IsConnected => Client.IsConnected && disconnectReason == null;
    public event Action<SteamConnectionException>? Disconnected;

    public SteamConnection(SteamRoute route, Func<HttpClient>? httpClientFactory = null)
    {
        this.route = route;
        var provider = new MemoryServerListProvider();
        if (route.Bootstrap)
            provider.UpdateServerListAsync([
                ServerRecord.CreateWebSocketServer(SmartCMServerList.DefaultServerWebsocket),
                ServerRecord.CreateDnsSocketServer(SmartCMServerList.DefaultServerNetfilter)
            ]).GetAwaiter().GetResult();
        Client = new SteamClient(SteamConfiguration.Create(c => c
            .WithProtocolTypes(route.Protocol).WithConnectionTimeout(TimeSpan.FromSeconds(15))
            .WithDirectoryFetch(!route.Bootstrap).WithServerListProvider(provider)
            .WithHttpClientFactory(_ => httpClientFactory?.Invoke() ?? new HttpClient { Timeout = TimeSpan.FromSeconds(15) })), identifier);
        user = Client.GetHandler<SteamUser>()!;
        callbacks = new CallbackManager(Client);
        subscriptions.Add(callbacks.Subscribe<SteamClient.ConnectedCallback>(_ => connected.TrySetResult(true)));
        subscriptions.Add(callbacks.Subscribe<SteamUser.LoggedOnCallback>(c => loggedOn.TrySetResult(c)));
        subscriptions.Add(callbacks.Subscribe<SteamUser.LoggedOffCallback>(c =>
            OnLost(new SteamConnectionException($"Steam 已结束会话：{c.Result}", CanRetry(c.Result)))));
        subscriptions.Add(callbacks.Subscribe<SteamClient.DisconnectedCallback>(c =>
        {
            if (!c.UserInitiated) OnLost(new SteamConnectionException($"{route.Label}：{diagnostic}"));
        }));
        DebugLog.Enabled = true;
        DebugLog.AddListener(this);
        _ = Task.Run(() =>
        {
            try { while (!lifetime.IsCancellationRequested) callbacks.RunWaitCallbacks(TimeSpan.FromMilliseconds(100)); }
            catch (Exception) when (lifetime.IsCancellationRequested) { }
            catch (Exception) { OnLost(new SteamConnectionException("Steam 回调处理异常")); }
        });
    }

    private void OnLost(SteamConnectionException error)
    {
        if (Volatile.Read(ref disposed) != 0 || Interlocked.CompareExchange(ref disconnectReason, error, null) != null) return;
        connected.TrySetException(error);
        loggedOn.TrySetException(error);
        lost.Cancel();
        Disconnected?.Invoke(error);
    }

    public async Task ConnectAsync(CancellationToken ct)
    {
        Client.Connect();
        try { await connected.Task.WaitAsync(TimeSpan.FromSeconds(25), ct); }
        catch (TimeoutException) { throw new SteamConnectionException($"{route.Label}：连接或节点查询超时"); }
    }

    public async Task<SteamTokens> AuthenticateAsync(string username, string password, IAuthenticator authenticator, CancellationToken ct)
    {
        using var attempt = CancellationTokenSource.CreateLinkedTokenSource(ct, lost.Token);
        try
        {
            var session = await Client.Authentication.BeginAuthSessionViaCredentialsAsync(new AuthSessionDetails
            {
                Username = username,
                Password = password,
                IsPersistentSession = true,
                Authenticator = authenticator,
                DeviceFriendlyName = "tML Pocket Launcher"
            }).WaitAsync(attempt.Token);
            var response = await session.PollingWaitForResultAsync(attempt.Token);
            return new SteamTokens(response.AccountName, response.RefreshToken);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested && lost.IsCancellationRequested)
        { throw disconnectReason ?? new SteamConnectionException("Steam 认证连接中断"); }
    }

    public async Task LogOnAsync(string username, string token, CancellationToken ct)
    {
        // WebSocket LocalIP is IPAddress.None for every instance. A random LoginID
        // prevents colliding with other SteamKit clients behind the same public IP.
        user.LogOn(new SteamUser.LogOnDetails
        {
            Username = username,
            AccessToken = token,
            ShouldRememberPassword = true,
            LoginID = loginId
        });
        var result = await loggedOn.Task.WaitAsync(TimeSpan.FromSeconds(35), ct);
        if (result.Result != EResult.OK)
            throw new SteamConnectionException($"Steam 会话登录失败：{result.Result} / {result.ExtendedResult}", CanRetry(result.Result));
    }

    public async Task LogOnAnonymousAsync(CancellationToken ct)
    {
        user.LogOnAnonymous();
        var result = await loggedOn.Task.WaitAsync(TimeSpan.FromSeconds(35), ct);
        if (result.Result != EResult.OK)
            throw new SteamConnectionException($"Steam 匿名会话登录失败：{result.Result}", CanRetry(result.Result));
    }

    public async Task<bool> OwnsTerrariaAsync(CancellationToken ct)
    {
        using var attempt = CancellationTokenSource.CreateLinkedTokenSource(ct, lost.Token);
        try
        {
            var ticket = await Client.GetHandler<SteamApps>()!.GetAppOwnershipTicket(105600).ToTask()
                .WaitAsync(TimeSpan.FromSeconds(30), attempt.Token);
            if (ticket.Result == EResult.OK) return true;
            if (ticket.Result is EResult.AccessDenied) return false;
            throw new SteamConnectionException($"Steam 游戏许可查询失败：{ticket.Result}", CanRetry(ticket.Result));
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested && lost.IsCancellationRequested)
        { throw disconnectReason ?? new SteamConnectionException("Steam 游戏许可查询连接中断"); }
    }

    internal static bool CanRetry(EResult result) => result is EResult.NoConnection or EResult.ServiceUnavailable or
        EResult.TryAnotherCM or EResult.Timeout or EResult.Busy or EResult.RemoteDisconnect or EResult.ConnectFailed;

    public void WriteLine(string category, string msg)
    {
        if (!category.Contains(identifier, StringComparison.Ordinal)) return;
        diagnostic = ClassifyDiagnostic(msg) ?? diagnostic;
    }

    // Classify connection failures only. Never expose raw SteamKit logs: they can
    // contain exception URLs or other context that does not belong in the UI.
    internal static string? ClassifyDiagnostic(string message)
    {
        if (message.Contains("AuthenticationException", StringComparison.Ordinal) || message.Contains("SSL", StringComparison.OrdinalIgnoreCase) || message.Contains("certificate", StringComparison.OrdinalIgnoreCase)) return "TLS/证书握手失败";
        if (message.Contains("No such host", StringComparison.OrdinalIgnoreCase) || message.Contains("NameResolution", StringComparison.OrdinalIgnoreCase)) return "DNS 解析失败";
        if (message.Contains("timed out", StringComparison.OrdinalIgnoreCase) || message.Contains("TaskCanceledException", StringComparison.Ordinal)) return "网络请求超时";
        if (message.Contains("WebSocketException", StringComparison.Ordinal)) return "WebSocket 握手或连接失败";
        if (message.Contains("SocketException", StringComparison.Ordinal)) return "网络连接被拒绝或中断";
        if (message.Contains("Server record task", StringComparison.Ordinal)) return "无法获取 Steam 服务器列表";
        return null;
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;
        DebugLog.RemoveListener(this);
        lifetime.Cancel(); lost.Cancel();
        foreach (var subscription in subscriptions) subscription.Dispose();
        // SteamKit waits synchronously for server discovery during Disconnect.
        // Detach first, then clean up independently so a slow directory request
        // cannot block fallback, logout, or the session state lock.
        _ = Task.Run(() =>
        {
            try { Client.Disconnect(); }
            catch (Exception) { /* This retired client cannot affect the active session. */ }
        });
    }
}
