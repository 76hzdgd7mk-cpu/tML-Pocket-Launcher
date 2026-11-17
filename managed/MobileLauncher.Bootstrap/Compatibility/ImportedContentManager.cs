using System.Reflection;

namespace MobileLauncher.Bootstrap.Compatibility;

/// <summary>Keeps vanilla resources and the release's overrides in their independent directories.</summary>
internal static class ImportedContentManager
{
    internal static void Configure(Assembly gameAssembly, object game, string contentDirectory)
    {
        const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
        if (gameAssembly.GetType("Terraria.Main", throwOnError: true)!
                .GetField("dedServ", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)
                ?.GetValue(null) is true)
        {
            return;
        }

        var contentProperty = game.GetType().GetProperty("Content", flags)
            ?? throw new NotSupportedException("The game has no Content manager property.");
        var previous = contentProperty.GetValue(game)
            ?? throw new NotSupportedException("The game Content manager has not been initialized.");
        var provider = previous.GetType().GetProperty("ServiceProvider", flags)!.GetValue(previous);
        var managerType = gameAssembly.GetType("Terraria.ModLoader.Engine.TMLContentManager", throwOnError: true)!;
        var localContent = Path.GetFullPath("Content");
        object? overrides = null;
        if (Directory.Exists(Path.Combine(localContent, "Images")))
        {
            overrides = Activator.CreateInstance(managerType, flags, null, [provider, localContent, null], null);
        }

        var manager = Activator.CreateInstance(managerType, flags, null,
            [provider, Path.GetFullPath(contentDirectory), overrides], null);
        contentProperty.SetValue(game, manager);
    }
}
