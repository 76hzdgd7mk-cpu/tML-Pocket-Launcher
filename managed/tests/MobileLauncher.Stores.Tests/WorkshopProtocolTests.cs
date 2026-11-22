using MobileLauncher.Stores;
using SteamKit2.Internal;
using Xunit;

namespace MobileLauncher.Stores.Tests;

public sealed class WorkshopProtocolTests
{
    [Fact]
    public void WorkshopModIncludesDependencyIdsWithoutLosingPrecision()
    {
        const ulong dependencyId = 9007199254740993;
        var item = new PublishedFileDetails { publishedfileid = 42 };
        foreach (var id in new[] { 0UL, 42UL, dependencyId, dependencyId })
            item.children.Add(new PublishedFileDetails.Child { publishedfileid = id });

        var mod = WorkshopService.MapItem(1281930, item);
        var resource = WorkshopService.MapItem(105600, item);

        Assert.Equal(dependencyId.ToString(), Assert.Single(mod["dependencyIds"]!.AsArray())!.GetValue<string>());
        Assert.Empty(resource["dependencyIds"]!.AsArray());
    }

    [Theory]
    [InlineData("../asset.png")]
    [InlineData("Content/../asset.png")]
    [InlineData("C:/asset.png")]
    [InlineData("/asset.png")]
    public void WorkshopManifestRejectsUnsafePaths(string path) =>
        Assert.Throws<InvalidDataException>(() => WorkshopService.WorkshopArchivePath(path));

    [Theory]
    [InlineData(105600u)]
    [InlineData(1281930u)]
    public void QueryUsesConsumerAndCreatorAppId(uint appId)
    {
        var request = WorkshopService.BuildQueryRequest(new WorkshopQuery(appId, "popular", 1, 24, null, "world"));

        Assert.Equal(appId, request.appid);
        Assert.Equal(appId, request.creator_appid);
        Assert.Equal(3u, request.query_type);
        Assert.Equal(1u, request.page);
        Assert.Equal(24u, request.numperpage);
        Assert.Contains("world", request.requiredtags);
    }

    [Theory]
    [InlineData("popular", 3u)]
    [InlineData("highestRated", 0u)]
    [InlineData("newest", 1u)]
    [InlineData("updated", 19u)]
    [InlineData("subscriptions", 12u)]
    [InlineData("playtimeTrend", 13u)]
    [InlineData("averagePlaytimeTrend", 15u)]
    [InlineData("totalPlaytime", 14u)]
    [InlineData("averagePlaytime", 16u)]
    [InlineData("sessionsTrend", 17u)]
    [InlineData("totalSessions", 18u)]
    public void QueryMapsSortMode(string sort, uint queryType)
    {
        var request = WorkshopService.BuildQueryRequest(new WorkshopQuery(105600, sort, 2, 20, null));

        Assert.Equal(queryType, request.query_type);
    }

    [Theory]
    [InlineData(0u)]
    [InlineData(1u)]
    [InlineData(7u)]
    [InlineData(30u)]
    [InlineData(90u)]
    [InlineData(180u)]
    [InlineData(365u)]
    public void QueryPassesSelectedTimeRange(uint days)
    {
        var request = WorkshopService.BuildQueryRequest(new WorkshopQuery(105600, "popular", 1, 20, Days: days));

        Assert.Equal(days, request.days);
    }

    [Fact]
    public void TmlFiltersUseWorkshopApiTagNames()
    {
        var request = WorkshopService.BuildQueryRequest(new WorkshopQuery(1281930, "popular", 1, 20, null, "New Content", "1.4.4", "Chinese"));
        Assert.Equal(new[] { "New Content", "1.4.4", "Chinese" }, request.requiredtags);
    }

    [Fact]
    public void QueryRejectsUnknownAppAndSort()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            WorkshopService.BuildQueryRequest(new WorkshopQuery(999, "popular", 1, 20, null)));
        Assert.Throws<ArgumentException>(() =>
            WorkshopService.BuildQueryRequest(new WorkshopQuery(105600, "random", 1, 20, null)));
    }

    [Fact]
    public void QueryBoundsPagingAndSearch()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            WorkshopService.BuildQueryRequest(new WorkshopQuery(105600, "popular", 0, 20, null)));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            WorkshopService.BuildQueryRequest(new WorkshopQuery(105600, "popular", 1, 31, null)));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            WorkshopService.BuildQueryRequest(new WorkshopQuery(105600, "popular", 1, 20, Days: 2)));
        Assert.Throws<ArgumentException>(() =>
            WorkshopService.BuildQueryRequest(new WorkshopQuery(105600, "popular", 1, 20, new string('x', 257))));
    }
}
