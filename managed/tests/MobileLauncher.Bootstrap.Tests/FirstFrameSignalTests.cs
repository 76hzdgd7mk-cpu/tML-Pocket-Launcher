using MobileLauncher.Bootstrap.Compatibility;
using Xunit;

namespace MobileLauncher.Bootstrap.Tests;

public sealed class FirstFrameSignalTests
{
    [Fact]
    public void FailedPresentationDoesNotDismissStartup()
    {
        var notifications = 0;
        var signal = new FirstFrameSignal(() => notifications++);
        Assert.Throws<InvalidOperationException>(() => signal.AfterPresent(() => throw new InvalidOperationException()));
        Assert.Equal(0, notifications);
        Assert.Equal("frame", signal.AfterPresent(() => "frame"));
        signal.AfterPresent(() => null);
        Assert.Equal(1, notifications);
    }

    [Fact]
    public void NotificationFailureDoesNotBreakGameAndCanRetry()
    {
        var attempts = 0;
        var signal = new FirstFrameSignal(() => { if (++attempts == 1) throw new IOException(); });
        Assert.Equal(42, signal.AfterPresent(() => 42));
        signal.AfterPresent(() => null);
        signal.AfterPresent(() => null);
        Assert.Equal(2, attempts);
    }
}
