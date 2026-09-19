using TmlAndroidBootstrap;
using TmlAndroidBootstrap.Android;
using TmlAndroidHost;

var workingDirectory = Environment.GetEnvironmentVariable("TML_ANDROID_GAME_ROOT")
    ?? Directory.GetCurrentDirectory();
var cacheDirectory = Environment.GetEnvironmentVariable("TML_ANDROID_CACHE")
    ?? Path.Combine(workingDirectory, "cache");
var assemblyPath = Environment.GetEnvironmentVariable("TML_TMODLOADER_ASSEMBLY")
    ?? Path.Combine(workingDirectory, "tModLoader.dll");
var contentDirectory = Environment.GetEnvironmentVariable("TML_ANDROID_CONTENT")
    ?? Path.Combine(workingDirectory, "Content");

Directory.CreateDirectory(workingDirectory);
Directory.CreateDirectory(cacheDirectory);
Environment.SetEnvironmentVariable("TML_ANDROID_FILES", workingDirectory);
Environment.SetEnvironmentVariable("TML_ANDROID_CACHE", cacheDirectory);
Environment.SetEnvironmentVariable("TML_ANDROID_CONTENT", contentDirectory);

IAndroidBridge bridge = OperatingSystem.IsAndroid()
    ? new JniAndroidBridge(workingDirectory, cacheDirectory)
    : new NullAndroidBridge(workingDirectory, cacheDirectory);

if (OperatingSystem.IsAndroid())
    await SteamContentPreparation.EnsureTerrariaContentAsync(bridge, workingDirectory);

return new TmlAndroidBootstrap.TmlAndroidBootstrap(bridge)
    .LaunchManagedGame(assemblyPath, args);
