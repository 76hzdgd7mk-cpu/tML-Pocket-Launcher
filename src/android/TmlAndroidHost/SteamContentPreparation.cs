using TmlAndroidBootstrap.Android;
using TmlAndroidContent.Steam;

namespace TmlAndroidHost;

internal static class SteamContentPreparation
{
    public static async Task EnsureTerrariaContentAsync(
        IAndroidBridge bridge,
        string gameDirectory,
        CancellationToken cancellationToken = default)
    {
        var contentDirectory = Path.Combine(gameDirectory, "Content");
        if (HasContent(contentDirectory))
            return;

        var store = new AndroidKeystoreSteamCredentialStore();
        var credentials = await store.LoadAsync(cancellationToken).ConfigureAwait(false);
        if (credentials is null)
            credentials = await LoginAsync(bridge, store, cancellationToken).ConfigureAwait(false);

        try
        {
            await DownloadOwnedContentAsync(credentials, gameDirectory, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (Exception) when (credentials is not null)
        {
            await store.ClearAsync(cancellationToken).ConfigureAwait(false);
            credentials = await LoginAsync(bridge, store, cancellationToken).ConfigureAwait(false);
            await DownloadOwnedContentAsync(credentials, gameDirectory, cancellationToken)
                .ConfigureAwait(false);
        }
    }

    private static async Task<SteamCredentials> LoginAsync(
        IAndroidBridge bridge,
        ISteamCredentialStore store,
        CancellationToken cancellationToken)
    {
        var account = await bridge.PromptTextAsync(
            "Steam account", false, cancellationToken).ConfigureAwait(false);
        var password = await bridge.PromptTextAsync(
            "Steam password", true, cancellationToken).ConfigureAwait(false);
        if (string.IsNullOrWhiteSpace(account) || string.IsNullOrWhiteSpace(password))
            throw new InvalidOperationException("Steam login was cancelled.");

        try
        {
            using var login = new SteamLoginService();
            var result = await login.LoginAsync(
                account,
                password,
                guardData: null,
                new AndroidSteamGuardCodeProvider(bridge),
                cancellationToken).ConfigureAwait(false);
            await store.SaveAsync(result.Credentials, cancellationToken).ConfigureAwait(false);
            return result.Credentials;
        }
        finally
        {
            password = string.Empty;
        }
    }

    private static async Task DownloadOwnedContentAsync(
        SteamCredentials credentials,
        string gameDirectory,
        CancellationToken cancellationToken)
    {
        using var session = new SteamSession(credentials);
        await session.ConnectAsync(cancellationToken).ConfigureAwait(false);
        if (!await session.VerifyTerrariaOwnershipAsync(cancellationToken).ConfigureAwait(false))
            throw new InvalidOperationException("The signed-in Steam account does not own Terraria (105600).");

        await new SteamTerrariaContentDownloader()
            .DownloadAsync(session, gameDirectory, cancellationToken)
            .ConfigureAwait(false);
    }

    private static bool HasContent(string contentDirectory) =>
        Directory.Exists(contentDirectory) &&
        Directory.EnumerateFiles(contentDirectory, "*", SearchOption.AllDirectories).Any();

    private sealed class AndroidSteamGuardCodeProvider(IAndroidBridge bridge) : ISteamGuardCodeProvider
    {
        public async Task<string> GetCodeAsync(
            bool previousCodeWasIncorrect,
            CancellationToken cancellationToken)
        {
            var title = previousCodeWasIncorrect
                ? "Steam Guard code (try again)"
                : "Steam Guard code";
            var code = await bridge.PromptTextAsync(title, false, cancellationToken)
                .ConfigureAwait(false);
            if (string.IsNullOrWhiteSpace(code))
                throw new InvalidOperationException("Steam Guard input was cancelled.");
            return code.Trim();
        }
    }
}
