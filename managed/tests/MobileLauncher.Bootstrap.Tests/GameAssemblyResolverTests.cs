using System.Reflection;
using MobileLauncher.Bootstrap.Runtime;
using Xunit;

namespace MobileLauncher.Bootstrap.Tests;

public sealed class GameAssemblyResolverTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "launcher-resolver-" + Guid.NewGuid().ToString("N"));

    [Fact]
    public void LauncherCompatibilityAssembliesTakePrecedenceOverGameCopies()
    {
        var name = typeof(GameAssemblyResolver).Assembly.GetName();
        var game = CopyAssembly("game", name.Name!);
        var compatibility = CopyAssembly("compatibility", name.Name!);
        using var resolver = new GameAssemblyResolver(Path.GetDirectoryName(game)!, Path.GetDirectoryName(compatibility));
        Assert.Equal(compatibility, resolver.FindAssemblyPath(name));
    }

    [Fact]
    public void FindsRelocatedDependenciesUnderVersionedLibraries()
    {
        var name = typeof(GameAssemblyResolver).Assembly.GetName();
        var dependency = CopyAssembly("game/Libraries/Bootstrap/1.0.0/lib/net10.0", name.Name!);
        using var resolver = new GameAssemblyResolver(Path.Combine(_root, "game"));
        Assert.Equal(dependency, resolver.FindAssemblyPath(name));
        Assert.Null(resolver.FindAssemblyPath(new AssemblyName("Missing.Library")));
    }

    [Fact]
    public void InvalidDllDoesNotPreventResolvingAnotherDependency()
    {
        var name = typeof(GameAssemblyResolver).Assembly.GetName();
        var dependency = CopyAssembly("game/Libraries/Bootstrap", name.Name!);
        var invalid = Path.Combine(_root, "game", name.Name + ".dll");
        File.WriteAllText(invalid, "not a managed assembly");
        using var resolver = new GameAssemblyResolver(Path.Combine(_root, "game"));
        Assert.Equal(dependency, resolver.FindAssemblyPath(name));
    }

    private string CopyAssembly(string subdirectory, string name)
    {
        var directory = Path.Combine(_root, subdirectory);
        Directory.CreateDirectory(directory);
        var path = Path.GetFullPath(Path.Combine(directory, name + ".dll"));
        File.Copy(typeof(GameAssemblyResolver).Assembly.Location, path);
        return path;
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }
}
