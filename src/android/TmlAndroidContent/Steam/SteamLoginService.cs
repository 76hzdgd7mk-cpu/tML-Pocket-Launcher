using SteamKit2;
using SteamKit2.Authentication;

namespace TmlAndroidContent.Steam;

public sealed record SteamLoginResult(SteamCredentials Credentials);

public sealed class SteamLoginService : IDisposable
{
    private readonly SteamClient _client;
    private readonly CallbackManager _callbacks;
    private readonly SteamUser _user;
    private readonly TaskCompletionSource _connected =
        new(TaskCreationOptions.RunContinuationsAsynchronously);
    private Thread? _callbackThread;
    private volatile bool _running;
    private int _disposed;

    public SteamLoginService()
    {
        var configuration = SteamConfiguration.Create(builder =>
            builder.WithProtocolTypes(ProtocolTypes.WebSocket));

        _client = new SteamClient(configuration);
        _callbacks = new CallbackManager(_client);
        _user = _client.GetHandler<SteamUser>()!;
        _callbacks.Subscribe<SteamClient.ConnectedCallback>(_ => _connected.TrySetResult());
    }

    public async Task<SteamLoginResult> LoginAsync(
        string accountName,
        string password,
        string? guardData,
        ISteamGuardCodeProvider guardCodeProvider,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(accountName);
        ArgumentException.ThrowIfNullOrWhiteSpace(password);
        ArgumentNullException.ThrowIfNull(guardCodeProvider);

        StartCallbacks();
        _client.Connect();
        await _connected.Task.WaitAsync(cancellationToken).ConfigureAwait(false);

        var authSession = await _client.Authentication.BeginAuthSessionViaCredentialsAsync(
            new AuthSessionDetails
            {
                Username = accountName,
                Password = password,
                GuardData = guardData,
                IsPersistentSession = true,
                Authenticator = new GuardAuthenticator(guardCodeProvider, cancellationToken),
            }).ConfigureAwait(false);

        var response = await authSession.PollingWaitForResultAsync().WaitAsync(cancellationToken)
            .ConfigureAwait(false);

        return new SteamLoginResult(new SteamCredentials(
            response.AccountName,
            response.RefreshToken,
            response.NewGuardData ?? guardData));
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0)
            return;

        _running = false;
        try
        {
            _client.Disconnect();
        }
        catch (Exception)
        {
            // Disconnect is best effort during Android activity teardown.
        }

        _callbackThread?.Join(TimeSpan.FromSeconds(2));
    }

    private void StartCallbacks()
    {
        if (_callbackThread is { IsAlive: true })
            return;

        _running = true;
        _callbackThread = new Thread(() =>
        {
            while (_running)
                _callbacks.RunWaitCallbacks(TimeSpan.FromSeconds(1));
        })
        {
            IsBackground = true,
            Name = "TmlSteamCallbacks",
        };
        _callbackThread.Start();
    }

    private sealed class GuardAuthenticator(
        ISteamGuardCodeProvider provider,
        CancellationToken cancellationToken) : IAuthenticator
    {
        public Task<string> GetDeviceCodeAsync(bool previousCodeWasIncorrect) =>
            provider.GetCodeAsync(previousCodeWasIncorrect, cancellationToken);

        public Task<string> GetEmailCodeAsync(string email, bool previousCodeWasIncorrect) =>
            provider.GetCodeAsync(previousCodeWasIncorrect, cancellationToken);

        public Task<bool> AcceptDeviceConfirmationAsync() => Task.FromResult(true);
    }
}
