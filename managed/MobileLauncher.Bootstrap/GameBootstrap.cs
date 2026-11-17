using MobileLauncher.Bootstrap.Platform;
using MobileLauncher.Bootstrap.Runtime;

namespace MobileLauncher.Bootstrap;

public sealed class GameBootstrap
{
    private readonly TmlLoaderEntrypoint _entrypoint = new();

    public GameBootstrap(IAndroidBridge androidBridge)
    {
        AndroidBridge = androidBridge ?? throw new ArgumentNullException(nameof(androidBridge));
    }

    public IAndroidBridge AndroidBridge { get; }

    public int LaunchManagedGame(string assemblyPath, string[] arguments)
    {
        if (string.IsNullOrWhiteSpace(assemblyPath))
        {
            throw new ArgumentException("An assembly path is required.", nameof(assemblyPath));
        }

        return _entrypoint.Launch(
            assemblyPath,
            arguments,
            AndroidBridge.FilesDirectory,
            AndroidBridge);
    }
}
