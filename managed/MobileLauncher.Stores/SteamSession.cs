using System.Security.Cryptography;
using System.Text.Json.Nodes;
using SteamKit2;
using SteamKit2.Authentication;
using SteamKit2.CDN;

namespace MobileLauncher.Stores;

internal sealed class SteamSession : IAuthenticator, IDisposable
{
    private const uint Terraria = 105600;
    private static readonly SteamRoute[] Routes = [new(ProtocolTypes.WebSocket), new(ProtocolTypes.Tcp),
        new(ProtocolTypes.WebSocket, true), new(ProtocolTypes.Tcp, true)];
    private readonly Func<SteamRoute, ISteamConnection> connectionFactory;
    private readonly Func<CancellationToken, Task> retryDelay;
    private readonly object sync = new();
    private ISteamConnection? connection;
    private TaskCompletionSource<string>? guard;
    private CancellationTokenSource? loginCancellation;
    private Task? loginTask;
    private int generation;
    private string lastFailure = "";
    private readonly Queue<string> diagnostics = new();
    private string phase = "signedOut", message = "尚未登录", account = "", refreshToken = "";
    private bool owned;
    private bool retryOnResume;

    public SteamSession() : this(route => new SteamConnection(route), ct => Task.Delay(1000, ct)) { }

    internal SteamSession(Func<SteamRoute, ISteamConnection> connectionFactory, Func<CancellationToken, Task> retryDelay)
    {
        this.connectionFactory = connectionFactory;
        this.retryDelay = retryDelay;
    }

    public JsonObject Snapshot(bool credentials = false)
    {
        lock (sync)
        {
            var result = new JsonObject { ["phase"] = phase, ["message"] = message, ["account"] = account, ["owned"] = owned };
            result["canReconnect"] = refreshToken.Length > 0 && phase is "error" or "disconnected";
            result["diagnostics"] = string.Join('\n', diagnostics);
            if (credentials && refreshToken.Length > 0) result["credentials"] = new JsonObject { ["username"] = account, ["refreshToken"] = refreshToken };
            return result;
        }
    }

    public void Begin(JsonObject args)
    {
        lock (sync)
        {
            if (loginTask is { IsCompleted: false } && !loginCancellation!.IsCancellationRequested)
                throw new InvalidOperationException("Steam 登录已在进行");
            var username = args["username"]?.GetValue<string>()?.Trim() ?? "";
            var password = args["password"]?.GetValue<string>() ?? "";
            var token = args["refreshToken"]?.GetValue<string>() ?? "";
            if (username.Length is 0 or > 128 || (password.Length == 0 && token.Length == 0))
                throw new ArgumentException("请输入 Steam 账户名和密码");
            loginCancellation?.Cancel();
            loginCancellation = new CancellationTokenSource(TimeSpan.FromMinutes(5));
            connection?.Dispose(); connection = null;
            phase = "connecting"; message = "正在连接 Steam…"; owned = false; refreshToken = token; account = username;
            diagnostics.Clear(); lastFailure = "";
            retryOnResume = false;
            var attempt = ++generation;
            var ct = loginCancellation.Token;
            loginTask = Task.Run(() => LoginAsync(username, password, token, attempt, ct));
        }
    }

    private async Task LoginAsync(string username, string password, string token, int attempt, CancellationToken ct)
    {
        try
        {
            for (var index = 0; index < Routes.Length; index++)
            {
                ct.ThrowIfCancellationRequested();
                var route = Routes[index];
                ISteamConnection? current = null;
                try
                {
                    SetPhase(attempt, "connecting", $"正在连接 Steam · {route.Label}（{index + 1}/{Routes.Length}）");
                    current = connectionFactory(route);
                    lock (sync) { ct.ThrowIfCancellationRequested(); connection = current; }
                    var captured = current;
                    current.Disconnected += failure => OnDisconnected(captured, attempt, failure);
                    await current.ConnectAsync(ct);
                    if (token.Length == 0)
                    {
                        SetPhase(attempt, "authenticating", "已连接 Steam，正在验证账户…");
                        var authenticated = await current.AuthenticateAsync(username, password, this, ct);
                        username = authenticated.Account; token = authenticated.RefreshToken; password = "";
                        lock (sync)
                        {
                            ct.ThrowIfCancellationRequested();
                            if (attempt != generation) return;
                            account = username; refreshToken = token;
                        }
                    }
                    SetPhase(attempt, "authenticating", "认证完成，正在建立 Steam 会话…");
                    await current.LogOnAsync(username, token, ct);
                    var hasGame = await current.OwnsTerrariaAsync(ct);
                    lock (sync)
                    {
                        ct.ThrowIfCancellationRequested();
                        if (attempt != generation) return;
                        if (connection != current || !current.IsConnected) throw new SteamConnectionException("Steam 会话建立期间断开");
                        owned = hasGame;
                        phase = "ready"; message = owned ? "已拥有 Terraria，可以下载资源" : "登录成功，此账户没有可下载的 Terraria 许可";
                        Record($"会话已连接 · {route.Label}");
                    }
                    return;
                }
                catch (Exception failure) when (IsTransient(failure) && index < Routes.Length - 1 && !ct.IsCancellationRequested)
                {
                    lock (sync)
                    {
                        if (attempt != generation) return;
                        lastFailure = SafeError(failure);
                        Record($"{route.Label} · {lastFailure}");
                        guard?.TrySetCanceled(); guard = null;
                        if (connection == current) connection = null;
                    }
                    current?.Dispose(); current = null;
                    await retryDelay(ct);
                }
                finally
                {
                    lock (sync) if (connection != current) current?.Dispose();
                }
            }
        }
        catch (Exception error)
        {
            lock (sync)
            {
                if (attempt != generation) return;
                phase = "error";
                retryOnResume = IsTransient(error);
                lastFailure = error is OperationCanceledException ? "Steam 登录已取消或超时" : SafeError(error);
                message = $"Steam 连接未完成：{lastFailure}";
                Record(lastFailure);
                connection?.Dispose(); connection = null;
            }
        }
        finally { password = ""; lock (sync) if (attempt == generation) { guard?.TrySetCanceled(); guard = null; } }
    }

    private void OnDisconnected(ISteamConnection current, int attempt, SteamConnectionException error)
    {
        lock (sync)
        {
            if (attempt != generation || connection != current) return;
            Record(error.Message);
            guard?.TrySetException(error); guard = null;
            if (phase != "ready") return;
            retryOnResume = error.Retryable;
            connection = null;
            if (error.Retryable && refreshToken.Length > 0)
            {
                phase = "reconnecting"; message = "Steam 网络连接中断，正在恢复会话…";
                StartReconnect();
            }
            else { phase = "disconnected"; message = error.Message; owned = false; }
            current.Dispose();
        }
    }

    public void Reconnect()
    {
        lock (sync)
        {
            if (phase is "connecting" or "reconnecting" or "authenticating" or "email" or "device" or "confirmation") return;
            if (refreshToken.Length == 0) throw new InvalidOperationException("尚无可恢复的 Steam 会话，请重新登录");
            connection?.Dispose(); connection = null;
            StartReconnect();
        }
    }

    public void Resume()
    {
        lock (sync)
        {
            // Android may block sockets while backgrounded. Retry once on return
            // to the foreground, without repeating permanent authentication failures.
            if (retryOnResume && refreshToken.Length > 0 && phase is "error" or "disconnected")
                StartReconnect();
        }
    }

    public async Task<JsonObject> ProbeAsync(CancellationToken ct)
    {
        var results = new JsonArray();
        foreach (var route in Routes)
        {
            ct.ThrowIfCancellationRequested();
            using var probe = connectionFactory(route);
            try
            {
                await probe.ConnectAsync(ct);
                results.Add(new JsonObject { ["route"] = route.Label, ["ok"] = true });
                return new JsonObject { ["reachable"] = true, ["message"] = $"Steam 连接可用 · {route.Label}", ["attempts"] = results };
            }
            catch (Exception error) when (IsTransient(error) && !ct.IsCancellationRequested)
            {
                results.Add(new JsonObject { ["route"] = route.Label, ["ok"] = false, ["reason"] = SafeError(error) });
            }
        }
        return new JsonObject { ["reachable"] = false, ["message"] = "当前网络无法连接 Steam。请查看下方各连接方式的结果。", ["attempts"] = results };
    }

    private void StartReconnect()
    {
        loginCancellation?.Cancel();
        loginCancellation = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        var attempt = ++generation;
        var ct = loginCancellation.Token;
        var username = account;
        var token = refreshToken;
        phase = "reconnecting"; message = "正在恢复 Steam 会话…";
        loginTask = Task.Run(() => LoginAsync(username, "", token, attempt, ct));
    }

    private static bool IsTransient(Exception error) => error is SteamConnectionException { Retryable: true } or TimeoutException or HttpRequestException or System.Net.Sockets.SocketException ||
        error is AuthenticationException auth && SteamConnection.CanRetry(auth.Result);
    private void Record(string text) { if (diagnostics.Count == 12) diagnostics.Dequeue(); diagnostics.Enqueue($"{DateTimeOffset.UtcNow:HH:mm:ss} {text}"); }
    private void SetPhase(int attempt, string value, string text) { lock (sync) { if (attempt == generation) { phase = value; message = text; } } }
    private async Task<string> RequestCode(string kind, string text, bool previousIncorrect)
    {
        var pending = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        lock (sync) { guard = pending; phase = kind; message = (previousIncorrect ? "验证码不正确，请重试。" : "") + text; }
        return await pending.Task.WaitAsync(loginCancellation!.Token);
    }
    public Task<string> GetDeviceCodeAsync(bool previousCodeWasIncorrect) => RequestCode("device", "请输入 Steam Guard 动态码", previousCodeWasIncorrect);
    public Task<string> GetEmailCodeAsync(string email, bool previousCodeWasIncorrect) => RequestCode("email", "请输入 Steam 发到邮箱的验证码", previousCodeWasIncorrect);
    public Task<bool> AcceptDeviceConfirmationAsync() { lock (sync) { phase = "confirmation"; message = "请在 Steam 手机应用中批准本次登录"; } return Task.FromResult(true); }
    public void SubmitCode(string code)
    {
        lock (sync)
        {
            if (guard == null || code.Trim().Length is < 4 or > 10) throw new ArgumentException("当前没有待提交的验证码，或验证码格式无效");
            guard.TrySetResult(code.Trim()); guard = null; phase = "authenticating"; message = "正在校验验证码…";
        }
    }
    public void Logout()
    {
        lock (sync)
        {
            generation++;
            loginCancellation?.Cancel(); guard?.TrySetCanceled(); guard = null;
            connection?.Dispose(); connection = null;
            phase = "signedOut"; account = ""; refreshToken = ""; message = "尚未登录"; owned = false;
            diagnostics.Clear(); lastFailure = "";
            retryOnResume = false;
        }
    }

    public void Dispose() => Logout();

    public async Task<bool> VerifyOwnershipAsync(CancellationToken ct)
    {
        ISteamConnection current;
        int attempt;
        lock (sync)
        {
            if (phase != "ready" || connection is not { IsConnected: true })
                throw new InvalidOperationException("Steam 资源启动前需要登录 Steam 并验证 Terraria 所有权，请登录或恢复连接后重试");
            current = connection;
            attempt = generation;
        }
        var hasGame = await current.OwnsTerrariaAsync(ct);
        lock (sync)
        {
            ct.ThrowIfCancellationRequested();
            if (attempt != generation || connection != current || phase != "ready" || !current.IsConnected)
                throw new InvalidOperationException("Steam 会话已改变，请恢复连接后重新验证 Terraria 所有权");
            owned = hasGame;
            if (!hasGame) throw new InvalidOperationException("当前 Steam 账户未拥有 Terraria，无法运行 Steam 资源；请切换到拥有游戏的账户");
            return true;
        }
    }

    internal async Task<T> WithWorkshopConnectionAsync<T>(
        Func<ISteamConnection, CancellationToken, Task<T>> operation,
        CancellationToken ct)
    {
        ISteamConnection? authenticated;
        bool signedOut;
        int attempt;
        lock (sync)
        {
            authenticated = phase == "ready" && connection is { IsConnected: true } ? connection : null;
            signedOut = phase == "signedOut";
            attempt = generation;
        }

        if (authenticated != null)
        {
            var result = await operation(authenticated, ct);
            lock (sync)
            {
                if (attempt != generation || connection != authenticated || phase != "ready" || !authenticated.IsConnected)
                    throw new InvalidOperationException("Steam 会话已改变，请重试工坊操作");
            }
            return result;
        }

        if (!signedOut)
            throw new InvalidOperationException("Steam 会话当前不可用，请恢复连接后重试工坊操作");

        Exception? lastFailure = null;
        for (var index = 0; index < Routes.Length; index++)
        {
            ct.ThrowIfCancellationRequested();
            using var anonymous = connectionFactory(Routes[index]);
            try
            {
                await anonymous.ConnectAsync(ct);
                await anonymous.LogOnAnonymousAsync(ct);
                return await operation(anonymous, ct);
            }
            catch (Exception failure) when (IsTransient(failure) && index < Routes.Length - 1 && !ct.IsCancellationRequested)
            {
                lastFailure = failure;
            }
        }
        throw new IOException("Steam 匿名工坊连接失败，请登录 Steam 后重试", lastFailure);
    }

    public async Task<string> DownloadAsync(string root, Action<string, int> progress, CancellationToken ct)
    {
        await VerifyOwnershipAsync(ct);
        SteamClient client;
        lock (sync)
        {
            if (phase != "ready" || !owned || connection == null) throw new InvalidOperationException("请先连接拥有 Terraria 的 Steam 账户，连接中断时可使用恢复连接");
            client = connection.Client;
        }
        var apps = client.GetHandler<SteamApps>()!;
        var tokens = await apps.PICSGetAccessTokens(Terraria, null).ToTask().WaitAsync(ct);
        var access = tokens.AppTokens.GetValueOrDefault(Terraria);
        var product = await apps.PICSGetProductInfo(new SteamApps.PICSRequest(Terraria, access), null).ToTask().WaitAsync(ct);
        var app = (product.Results ?? throw new IOException("Steam 未返回应用清单")).SelectMany(r => r.Apps).First(p => p.Key == Terraria).Value.KeyValues;
        var content = client.GetHandler<SteamContent>()!;
        var servers = (await content.GetServersForSteamPipe(client.CellID, 20).WaitAsync(ct))
            .Where(s => s.Type is "CDN" or "SteamCache" && !s.UseAsProxy).Take(8).ToArray();
        if (servers.Length == 0) throw new IOException("Steam 未返回可用内容服务器");
        using var cdn = new Client(client);
        var directory = Path.Combine(root, "steam-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            var selected = new List<(uint Id, byte[] Key, DepotManifest Manifest)>();
            foreach (var depot in app["depots"].Children)
            {
                if (!uint.TryParse(depot.Name, out var id)) continue;
                var os = depot["config"]["oslist"].Value ?? "";
                if (os.Length > 0 && !os.Split(',').Contains("linux")) continue;
                if (!ulong.TryParse(depot["manifests"]["public"]["gid"].Value, out var manifestId)) continue;
                ct.ThrowIfCancellationRequested();
                progress($"Steam：读取资源清单 {id}", -1);
                var key = await apps.GetDepotDecryptionKey(id, Terraria).ToTask().WaitAsync(ct);
                if (key.Result != EResult.OK) throw new IOException($"Steam 无权下载资源库 {id}：{key.Result}");
                var code = await content.GetManifestRequestCode(id, Terraria, manifestId).WaitAsync(ct);
                if (code == 0) throw new IOException("Steam 未授予清单访问权限");
                var manifest = await WithServerAsync(servers, content, Terraria, id,
                    (server, auth) => cdn.DownloadManifestAsync(id, manifestId, code, server, key.DepotKey, cdnAuthToken: auth), ct);
                selected.Add((id, key.DepotKey, manifest));
            }
            var files = selected.SelectMany(d => d.Manifest.Files!.Where(f => f.LinkTarget is null or "" &&
                (StoreFiles.ContentPath(f.FileName) != null || (StoreFiles.VersionProbePath(f.FileName) != null &&
                    f.TotalSize <= (f.FileName.Replace('\\', '/').EndsWith("/gameinfo", StringComparison.Ordinal) || f.FileName == "gameinfo" ? 20480UL : 64UL * 1024 * 1024))) &&
                !f.Flags.HasFlag(EDepotFileFlag.Directory))
                .Select(f => (d.Id, d.Key, File: f))).ToArray();
            var total = files.Aggregate(0UL, (n, f) => checked(n + f.File.TotalSize));
            if (total == 0 || total > 8UL * 1024 * 1024 * 1024) throw new InvalidDataException("Steam 资源清单为空或过大");
            ulong done = 0;
            foreach (var item in files)
            {
                ct.ThrowIfCancellationRequested();
                var file = StoreFiles.Target(directory, StoreFiles.ContentPath(item.File.FileName) ?? StoreFiles.VersionProbePath(item.File.FileName)!);
                await using (var output = File.Create(file))
                {
                    output.SetLength(checked((long)item.File.TotalSize));
                    foreach (var chunk in item.File.Chunks.OrderBy(c => c.Offset))
                    {
                        ct.ThrowIfCancellationRequested();
                        if (chunk.UncompressedLength > 16 * 1024 * 1024 || chunk.Offset + chunk.UncompressedLength > item.File.TotalSize)
                            throw new InvalidDataException("Steam 分块长度超出文件范围");
                        var bytes = new byte[chunk.UncompressedLength];
                        var count = await WithServerAsync(servers, content, Terraria, item.Id,
                            (server, auth) => cdn.DownloadDepotChunkAsync(item.Id, chunk, server, bytes, item.Key, cdnAuthToken: auth), ct);
                        output.Position = checked((long)chunk.Offset);
                        await output.WriteAsync(bytes.AsMemory(0, count), ct);
                        done += (uint)count;
                        progress($"Steam：下载资源 {done / 1048576}/{total / 1048576} MB", (int)(done * 85 / total));
                    }
                }
                await StoreFiles.VerifySha1Async(file, item.File.FileHash, ct);
            }
            progress("Steam：校验完成，正在准备安装…", 90);
            await StoreFiles.PreserveVersionAsync(directory, null, ct);
            return await StoreFiles.PackageAsync(directory, ct);
        }
        finally { Directory.Delete(directory, true); }
    }

    internal static async Task<T> WithServerAsync<T>(Server[] servers, SteamContent content, uint appId, uint depot, Func<Server, string?, Task<T>> download, CancellationToken ct)
    {
        Exception? last = null;
        foreach (var server in servers)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                try { return await download(server, null).WaitAsync(TimeSpan.FromSeconds(60), ct); }
                catch (SteamKitWebRequestException error) when (error.StatusCode == System.Net.HttpStatusCode.Forbidden)
                {
                    var token = await content.GetCDNAuthToken(appId, depot, server.Host ?? throw new IOException("Steam CDN 地址无效")).WaitAsync(ct);
                    if (token.Result != EResult.OK) throw new IOException("Steam CDN 授权失败");
                    return await download(server, token.Token).WaitAsync(TimeSpan.FromSeconds(60), ct);
                }
            }
            catch (Exception error) when (error is not OperationCanceledException) { last = error; }
        }
        throw new IOException("Steam 内容服务器下载失败，请重试", last);
    }

    internal static string SafeError(Exception error) => error switch
    {
        AuthenticationException auth => $"Steam 认证失败：{auth.Result}",
        TimeoutException => "Steam 响应超时，请检查网络后重试",
        IOException => error.Message,
        _ => "Steam 请求失败，请检查网络、账户和 Steam Guard 后重试"
    };
}
