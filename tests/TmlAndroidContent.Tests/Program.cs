using TmlAndroidContent.Steam;
using TmlAndroidBootstrap.Android;

if (SteamSession.TerrariaAppId != 105600)
    throw new InvalidOperationException("Terraria App ID changed unexpectedly.");

var credentials = new SteamCredentials("account", "refresh-token", "guard-data");
if (credentials.AccountName != "account" || credentials.RefreshToken != "refresh-token")
    throw new InvalidOperationException("Steam credential record is not preserving values.");

if (typeof(AndroidKeystoreSteamCredentialStore).GetMethod(nameof(AndroidKeystoreSteamCredentialStore.ClearAsync)) is null)
    throw new InvalidOperationException("Keystore credential store has no clear operation.");

foreach (var expected in Enum.GetValues<AndroidLauncherAction>())
{
    if (!JniAndroidBridge.TryMapLauncherAction((int)expected, out var actual) || actual != expected)
        throw new InvalidOperationException($"Launcher action mapping failed for {expected}.");
}

if (JniAndroidBridge.TryMapLauncherAction(-1, out _))
    throw new InvalidOperationException("Invalid launcher action was accepted.");

Console.WriteLine("PASS Terraria app identity");
Console.WriteLine("PASS credential model");
Console.WriteLine("PASS launcher action mapping");
