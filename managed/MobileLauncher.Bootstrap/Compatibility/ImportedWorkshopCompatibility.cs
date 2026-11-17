using System.Reflection;

namespace MobileLauncher.Bootstrap.Compatibility;

/// <summary>Keeps tML's local workshop metadata without loading the desktop Steam API.</summary>
internal static class ImportedWorkshopCompatibility
{
    private const BindingFlags Flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static;

    internal static void Initialize(Type workshop)
    {
        foreach (var name in new[] { "SteamClient", "SteamAvailable" })
        {
            var property = workshop.GetProperty(name, Flags)
                ?? throw new NotSupportedException($"This tML version is missing {workshop.FullName}.{name}.");
            property.SetValue(null, false);
        }
        var tags = workshop.GetMethod("InitializeModTags", Flags, null, Type.EmptyTypes, null)
            ?? throw new NotSupportedException($"This tML version is missing workshop tag initialization.");
        tags.Invoke(null, null);
        Console.WriteLine("[ImportedGame] Workshop downloads are managed by the launcher; desktop Steam API is disabled.");
    }
}
