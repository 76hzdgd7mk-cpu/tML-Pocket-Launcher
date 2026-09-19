using System.Reflection;
using System.Runtime.Loader;

namespace TmlAndroidBootstrap.Runtime;

public sealed class TmlLoaderEntrypoint
{
    private int _started;

    public int Launch(string assemblyPath, string[] arguments, string workingDirectory)
    {
        if (Interlocked.Exchange(ref _started, 1) != 0)
            throw new InvalidOperationException("tModLoader can only be launched once per CoreCLR process.");

        if (!File.Exists(assemblyPath))
            throw new BootstrapStageException(BootstrapStage.Validation, $"tModLoader assembly was not found: {assemblyPath}");

        Directory.CreateDirectory(workingDirectory);
        Directory.SetCurrentDirectory(workingDirectory);
        Environment.SetEnvironmentVariable("DOTNET_ROOT", workingDirectory);
        Environment.SetEnvironmentVariable("XDG_DATA_HOME", workingDirectory);
        Environment.SetEnvironmentVariable("XDG_CONFIG_HOME", workingDirectory);

        try
        {
            Assembly assembly = AssemblyLoadContext.Default.LoadFromAssemblyPath(Path.GetFullPath(assemblyPath));
            MethodInfo? entryPoint = assembly.EntryPoint;
            if (entryPoint is null)
                throw new BootstrapStageException(BootstrapStage.Runtime, "tModLoader assembly has no entry point.");

            object? result = entryPoint.GetParameters().Length == 0
                ? entryPoint.Invoke(null, null)
                : entryPoint.Invoke(null, new object?[] { arguments });
            return result is int exitCode ? exitCode : 0;
        }
        catch (TargetInvocationException exception) when (exception.InnerException is not null)
        {
            throw new BootstrapStageException(BootstrapStage.Game, "tModLoader entry point failed.", exception.InnerException);
        }
    }
}
