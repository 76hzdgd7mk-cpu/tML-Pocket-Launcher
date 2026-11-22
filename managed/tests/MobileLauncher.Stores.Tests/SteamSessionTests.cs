using System.Collections.Concurrent;
using System.Text.Json.Nodes;
using SteamKit2;
using SteamKit2.Authentication;
using Xunit;

namespace MobileLauncher.Stores.Tests;

public sealed class SteamSessionTests
{
    [Fact]
    public async Task DisconnectBeforeGuardFallsBackToTcpAndStillCompletesGuard()
    {
        var routes = new ConcurrentQueue<SteamRoute>();
        using var session = new SteamSession(route =>
        {
            routes.Enqueue(route);
            return new FakeConnection
            {
                ConnectFailure = route.Protocol == ProtocolTypes.WebSocket ? new SteamConnectionException("WebSocket 握手失败") : null,
                RequireGuard = true
            };
        }, NoDelay);
        session.Begin(Credentials());
        await WaitForAsync(session, "device");
        Assert.Equal(new[] { ProtocolTypes.WebSocket, ProtocolTypes.Tcp }, routes.Select(r => r.Protocol));
        session.SubmitCode("ABCDE");
        await WaitForAsync(session, "ready");
        Assert.True(session.Snapshot()["owned"]!.GetValue<bool>());
        Assert.Null(session.Snapshot()["credentials"]);
        Assert.DoesNotContain("test-password", session.Snapshot().ToJsonString());
        Assert.Equal("private-refresh-token", session.Snapshot(true)["credentials"]!["refreshToken"]!.GetValue<string>());
    }

    [Fact]
    public async Task DirectoryFailureUsesBootstrapInsteadOfFailingBeforeAuthentication()
    {
        var routes = new ConcurrentQueue<SteamRoute>();
        using var session = new SteamSession(route =>
        {
            routes.Enqueue(route);
            return new FakeConnection { ConnectFailure = route.Bootstrap ? null : new SteamConnectionException("无法获取 Steam 服务器列表") };
        }, NoDelay);
        session.Begin(Credentials());
        await WaitForAsync(session, "ready");
        Assert.Equal(3, routes.Count);
        Assert.True(routes.Last().Bootstrap);
        Assert.Contains("备用节点", session.Snapshot()["diagnostics"]!.GetValue<string>());
    }

    [Fact]
    public async Task TerminalAuthenticationFailureDoesNotRepeatPasswordRequests()
    {
        var attempts = 0;
        using var session = new SteamSession(_ =>
        {
            Interlocked.Increment(ref attempts);
            return new FakeConnection { AuthFailure = new SteamConnectionException("Steam 认证失败：InvalidPassword", false) };
        }, NoDelay);
        session.Begin(Credentials());
        await WaitForAsync(session, "error");
        Assert.Equal(1, attempts);
        Assert.Contains("InvalidPassword", session.Snapshot()["message"]!.GetValue<string>());
        Assert.False(session.Snapshot()["canReconnect"]!.GetValue<bool>());
    }

    [Fact]
    public async Task AllRoutesFailWithUsefulConnectionReasonAndNoCredentials()
    {
        var attempts = 0;
        using var session = new SteamSession(_ =>
        {
            Interlocked.Increment(ref attempts);
            return new FakeConnection { ConnectFailure = new SteamConnectionException("TLS/证书握手失败") };
        }, NoDelay);
        session.Begin(Credentials());
        await WaitForAsync(session, "error");
        var state = session.Snapshot().ToJsonString();
        Assert.Equal(4, attempts);
        Assert.Contains("TLS/证书握手失败", session.Snapshot()["message"]!.GetValue<string>());
        Assert.DoesNotContain("test-password", state);
        Assert.DoesNotContain("private-refresh-token", state);
    }

    [Fact]
    public async Task AuthenticationTokenSurvivesLogonDisconnectAndRetryDoesNotAskForPassword()
    {
        var attempts = 0;
        var authRequests = 0;
        var observedTokens = new ConcurrentQueue<string>();
        using var session = new SteamSession(_ =>
        {
            var index = Interlocked.Increment(ref attempts);
            return new FakeConnection
            {
                OnAuth = () => Interlocked.Increment(ref authRequests),
                OnLogOn = token => observedTokens.Enqueue(token),
                LogOnFailure = index <= 4 ? new SteamConnectionException("会话建立期间断开") : null
            };
        }, NoDelay);
        session.Begin(Credentials());
        await WaitForAsync(session, "error");
        Assert.True(session.Snapshot()["canReconnect"]!.GetValue<bool>());
        Assert.Equal("private-refresh-token", session.Snapshot(true)["credentials"]!["refreshToken"]!.GetValue<string>());
        session.Reconnect();
        await WaitForAsync(session, "ready");
        Assert.Equal(1, authRequests);
        Assert.Equal(5, observedTokens.Count);
        Assert.All(observedTokens, token => Assert.Equal("private-refresh-token", token));
    }

    [Fact]
    public async Task ReadySessionAutomaticallyRecoversWithoutNewGuardAndIgnoresOldCallbacks()
    {
        var connections = new ConcurrentQueue<FakeConnection>();
        var authentications = 0;
        using var session = new SteamSession(_ =>
        {
            var connection = new FakeConnection { OnAuth = () => Interlocked.Increment(ref authentications) };
            connections.Enqueue(connection);
            return connection;
        }, NoDelay);
        session.Begin(Credentials());
        await WaitForAsync(session, "ready");
        var old = connections.First();
        old.Lose();
        await WaitForAsync(session, "ready");
        Assert.Equal(2, connections.Count);
        Assert.Equal(1, authentications);
        Assert.True(old.Disposed);
        old.Lose();
        Assert.Equal("ready", session.Snapshot()["phase"]!.GetValue<string>());
        Assert.True(session.Snapshot()["owned"]!.GetValue<bool>());
    }

    [Fact]
    public async Task ServerLogoffReasonIsRetainedWithoutUnboundedReconnect()
    {
        var fake = new FakeConnection();
        using var session = new SteamSession(_ => fake, NoDelay);
        session.Begin(Credentials());
        await WaitForAsync(session, "ready");
        fake.Lose(new SteamConnectionException("Steam 已结束会话：LoggedInElsewhere", false));
        Assert.Equal("disconnected", session.Snapshot()["phase"]!.GetValue<string>());
        Assert.Contains("LoggedInElsewhere", session.Snapshot()["message"]!.GetValue<string>());
        Assert.True(session.Snapshot()["canReconnect"]!.GetValue<bool>());
        Assert.False(session.Snapshot()["owned"]!.GetValue<bool>());
    }

    [Fact]
    public async Task LogoutCancelsGuardAndLateCallbacksCannotRestoreCredentials()
    {
        var connections = new ConcurrentQueue<FakeConnection>();
        using var session = new SteamSession(_ =>
        {
            var fake = new FakeConnection { RequireGuard = connections.IsEmpty };
            connections.Enqueue(fake);
            return fake;
        }, NoDelay);
        session.Begin(Credentials());
        await WaitForAsync(session, "device");
        session.Logout();
        Assert.Equal("signedOut", session.Snapshot()["phase"]!.GetValue<string>());
        Assert.Null(session.Snapshot(true)["credentials"]);
        session.Begin(Credentials());
        await WaitForAsync(session, "ready");
        connections.First().Lose();
        Assert.Equal("ready", session.Snapshot()["phase"]!.GetValue<string>());
    }

    [Fact]
    public async Task ForegroundReturnRecoversTokenAfterBackgroundRetriesAreExhausted()
    {
        var attempts = 0;
        var authentications = 0;
        using var session = new SteamSession(_ => new FakeConnection
        {
            OnAuth = () => Interlocked.Increment(ref authentications),
            LogOnFailure = Interlocked.Increment(ref attempts) <= 4 ? new SteamConnectionException("后台网络受限") : null
        }, NoDelay);
        session.Begin(Credentials());
        await WaitForAsync(session, "error");
        session.Resume();
        await WaitForAsync(session, "ready");
        Assert.Equal(5, attempts);
        Assert.Equal(1, authentications);
        session.Resume();
        Assert.Equal(5, attempts);
    }

    [Fact]
    public async Task ForegroundReturnDoesNotRetryPermanentLogoffOrSignedOutAccount()
    {
        var attempts = 0;
        var fake = new FakeConnection();
        using var session = new SteamSession(_ => { Interlocked.Increment(ref attempts); return fake; }, NoDelay);
        session.Resume();
        Assert.Equal(0, attempts);
        session.Begin(Credentials());
        await WaitForAsync(session, "ready");
        fake.Lose(new SteamConnectionException("Steam 已结束会话：LoggedInElsewhere", false));
        session.Resume();
        await Task.Delay(50);
        Assert.Equal("disconnected", session.Snapshot()["phase"]!.GetValue<string>());
        Assert.Equal(1, attempts);
        session.Logout();
        session.Resume();
        Assert.Equal("signedOut", session.Snapshot()["phase"]!.GetValue<string>());
        Assert.Equal(1, attempts);
    }

    [Theory]
    [InlineData(EResult.NoConnection, true)]
    [InlineData(EResult.TryAnotherCM, true)]
    [InlineData(EResult.ServiceUnavailable, true)]
    [InlineData(EResult.InvalidPassword, false)]
    [InlineData(EResult.RateLimitExceeded, false)]
    [InlineData(EResult.LoggedInElsewhere, false)]
    public void OnlyRetriesTransientSteamResults(EResult result, bool expected) => Assert.Equal(expected, SteamConnection.CanRetry(result));

    [Theory]
    [InlineData("WebSocketException: private-refresh-token", "WebSocket 握手或连接失败")]
    [InlineData("AuthenticationException https://example?password=secret", "TLS/证书握手失败")]
    [InlineData("Server record task threw exception token=secret", "无法获取 Steam 服务器列表")]
    [InlineData("Account message token=secret", null)]
    public void ConnectionDiagnosticsDoNotExposeRawMessages(string raw, string? expected) => Assert.Equal(expected, SteamConnection.ClassifyDiagnostic(raw));

    private static JsonObject Credentials() => new() { ["username"] = "test-account", ["password"] = "test-password" };

    [Fact]
    public async Task SlowDirectoryCleanupCannotBlockProtocolFallbackOrLogout()
    {
        using var handler = new PendingDirectory();
        var connection = new SteamConnection(new SteamRoute(ProtocolTypes.WebSocket), () => new HttpClient(handler, false));
        using var cancellation = new CancellationTokenSource();
        try
        {
            var connect = connection.ConnectAsync(cancellation.Token);
            await handler.Started.Task.WaitAsync(TimeSpan.FromSeconds(2));
            cancellation.Cancel();
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => connect);
            // SteamKit's Disconnect synchronously waits for server-list setup.
            // Our disposal must detach callbacks and let fallback proceed anyway.
            await Task.Run(connection.Dispose).WaitAsync(TimeSpan.FromSeconds(1));
        }
        finally
        {
            handler.Release.TrySetResult();
            connection.Dispose();
        }
    }

    private sealed class PendingDirectory : HttpMessageHandler
    {
        public TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Started.TrySetResult();
            await Release.Task;
            return new HttpResponseMessage(System.Net.HttpStatusCode.ServiceUnavailable);
        }
    }

    [Fact]
    public async Task ConnectionProbeUsesFallbackWithoutAuthenticatingOrChangingAccountState()
    {
        var authentications = 0;
        using var session = new SteamSession(route => new FakeConnection
        {
            ConnectFailure = route.Protocol == ProtocolTypes.WebSocket ? new SteamConnectionException("WebSocket 连接失败") : null,
            OnAuth = () => Interlocked.Increment(ref authentications)
        }, NoDelay);
        var result = await session.ProbeAsync(default);
        Assert.True(result["reachable"]!.GetValue<bool>());
        Assert.Equal(2, result["attempts"]!.AsArray().Count);
        Assert.Equal(0, authentications);
        Assert.Equal("signedOut", session.Snapshot()["phase"]!.GetValue<string>());
    }

    [Fact]
    public async Task LaunchVerificationRequiresLoginAndRechecksOwnership()
    {
        var fake = new FakeConnection();
        using var session = new SteamSession(_ => fake, NoDelay);
        await Assert.ThrowsAsync<InvalidOperationException>(() => session.VerifyOwnershipAsync(default));
        Assert.Equal(0, fake.OwnershipChecks);
        session.Begin(Credentials());
        await WaitForAsync(session, "ready");
        Assert.Equal(1, fake.OwnershipChecks);
        Assert.True(await session.VerifyOwnershipAsync(default));
        Assert.Equal(2, fake.OwnershipChecks);
        fake.HasGame = false;
        await Assert.ThrowsAsync<InvalidOperationException>(() => session.VerifyOwnershipAsync(default));
        Assert.Equal(3, fake.OwnershipChecks);
        Assert.False(session.Snapshot()["owned"]!.GetValue<bool>());
    }

    [Fact]
    public async Task VerificationCannotAuthorizeAfterLogoutDuringQuery()
    {
        var fake = new FakeConnection();
        using var session = new SteamSession(_ => fake, NoDelay);
        session.Begin(Credentials());
        await WaitForAsync(session, "ready");
        var pending = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        fake.OwnershipQuery = () => pending.Task;
        var verification = session.VerifyOwnershipAsync(default);
        session.Logout();
        pending.SetResult(true);
        await Assert.ThrowsAsync<InvalidOperationException>(() => verification);
    }

    [Fact]
    public async Task WorkshopUsesTheExistingAuthenticatedConnection()
    {
        var fake = new FakeConnection();
        using var session = new SteamSession(_ => fake, NoDelay);
        session.Begin(Credentials());
        await WaitForAsync(session, "ready");

        var selected = await session.WithWorkshopConnectionAsync((connection, _) => Task.FromResult(connection), default);

        Assert.Same(fake, selected);
        Assert.Equal(0, fake.AnonymousLogons);
        Assert.False(fake.Disposed);
    }

    [Fact]
    public async Task WorkshopUsesAnOwnedAnonymousConnectionWhenSignedOut()
    {
        var connections = new ConcurrentQueue<FakeConnection>();
        using var session = new SteamSession(_ =>
        {
            var connection = new FakeConnection();
            connections.Enqueue(connection);
            return connection;
        }, NoDelay);

        var selected = await session.WithWorkshopConnectionAsync((connection, _) => Task.FromResult(connection), default);

        Assert.Same(connections.Single(), selected);
        Assert.Equal(1, connections.Single().AnonymousLogons);
        Assert.True(connections.Single().Disposed);
    }

    private static Task NoDelay(CancellationToken ct) { ct.ThrowIfCancellationRequested(); return Task.CompletedTask; }
    private static async Task WaitForAsync(SteamSession session, string phase)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        while (session.Snapshot()["phase"]!.GetValue<string>() != phase) await Task.Delay(10, timeout.Token);
    }

    private sealed class FakeConnection : ISteamConnection
    {
        public SteamClient Client => throw new InvalidOperationException("Network is not used in session tests");
        public bool IsConnected { get; private set; }
        public event Action<SteamConnectionException>? Disconnected;
        public Exception? ConnectFailure { get; init; }
        public Exception? AuthFailure { get; init; }
        public Exception? LogOnFailure { get; init; }
        public bool RequireGuard { get; init; }
        public Action? OnAuth { get; init; }
        public Action<string>? OnLogOn { get; init; }
        public bool Disposed { get; private set; }
        public int AnonymousLogons { get; private set; }
        public Task ConnectAsync(CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();
            if (ConnectFailure != null) throw ConnectFailure;
            IsConnected = true;
            return Task.CompletedTask;
        }
        public async Task<SteamTokens> AuthenticateAsync(string username, string password, IAuthenticator authenticator, CancellationToken ct)
        {
            OnAuth?.Invoke();
            if (AuthFailure != null) throw AuthFailure;
            if (RequireGuard) Assert.Equal("ABCDE", await authenticator.GetDeviceCodeAsync(false).WaitAsync(ct));
            return new SteamTokens(username, "private-refresh-token");
        }
        public Task LogOnAsync(string username, string token, CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();
            OnLogOn?.Invoke(token);
            if (LogOnFailure != null) throw LogOnFailure;
            return Task.CompletedTask;
        }
        public Task LogOnAnonymousAsync(CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();
            AnonymousLogons++;
            return Task.CompletedTask;
        }
        public bool HasGame { get; set; } = true;
        public int OwnershipChecks { get; private set; }
        public Func<Task<bool>>? OwnershipQuery { get; set; }
        public Task<bool> OwnsTerrariaAsync(CancellationToken ct)
        {
            OwnershipChecks++;
            return OwnershipQuery?.Invoke() ?? Task.FromResult(HasGame);
        }
        public void Lose(SteamConnectionException? error = null)
        {
            IsConnected = false;
            Disconnected?.Invoke(error ?? new SteamConnectionException("网络连接已中断"));
        }
        public void Dispose() { Disposed = true; IsConnected = false; }
    }
}
