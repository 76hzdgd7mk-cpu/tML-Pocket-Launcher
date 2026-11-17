using MobileLauncher.Bootstrap.Compatibility;
using Xunit;

namespace MobileLauncher.Bootstrap.Tests;

public sealed class ImportedWorkshopCompatibilityTests
{
    [Fact]
    public void OfflineInitializationKeepsTagsWithoutStartingDesktopSteam()
    {
        Workshop.SteamClient = true;
        Workshop.SteamAvailable = true;
        Workshop.TagsInitialized = false;

        ImportedWorkshopCompatibility.Initialize(typeof(Workshop));

        Assert.False(Workshop.SteamClient);
        Assert.False(Workshop.SteamAvailable);
        Assert.True(Workshop.TagsInitialized);
    }

    private static class Workshop
    {
        public static bool SteamClient { get; set; }
        internal static bool SteamAvailable { get; set; }
        internal static bool TagsInitialized { get; set; }
        private static void InitializeModTags() => TagsInitialized = true;
    }
}
