using MobileLauncher.Bootstrap.Compatibility;
using Xunit;

namespace MobileLauncher.Bootstrap.Tests
{
    public sealed class ImportedContentManagerTests
    {
        [Theory]
        [InlineData("terraria")]
        [InlineData("terraria/Content")]
        public void UsesExplicitContentPathForResourcesOnlyAndWrappedImports(string relativeContent)
        {
            var root = Path.Combine(Path.GetTempPath(), "launcher-content-" + Guid.NewGuid().ToString("N"));
            var content = Path.Combine(root, relativeContent);
            Directory.CreateDirectory(Path.Combine(content, "Images"));
            var game = new Terraria.Main();
            try
            {
                ImportedContentManager.Configure(typeof(Terraria.Main).Assembly, game, content);
                var manager = Assert.IsType<Terraria.ModLoader.Engine.TMLContentManager>(game.Content);
                Assert.Equal(Path.GetFullPath(content), manager.RootDirectory);
                Assert.Same(game.Services, manager.ServiceProvider);
            }
            finally
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }
}

namespace Terraria
{
    public sealed class Main
    {
        public static bool dedServ = false;
        public IServiceProvider Services { get; } = new EmptyServices();
        public object Content { get; set; }
        public Main() => Content = new ModLoader.Engine.TMLContentManager(Services, "original", null);
        private sealed class EmptyServices : IServiceProvider
        {
            public object? GetService(Type serviceType) => null;
        }
    }
}

namespace Terraria.ModLoader.Engine
{
    public sealed class TMLContentManager(IServiceProvider serviceProvider, string rootDirectory, TMLContentManager? overrides)
    {
        public IServiceProvider ServiceProvider { get; } = serviceProvider;
        public string RootDirectory { get; } = rootDirectory;
        public TMLContentManager? Overrides { get; } = overrides;
    }
}
