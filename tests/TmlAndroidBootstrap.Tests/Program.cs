using TmlAndroidBootstrap.Android;

namespace TmlAndroidBootstrap.Tests;

internal static class Program
{
    private static int Main()
    {
        Run("fifo", TestFifo);
        Run("overflow drops oldest", TestOverflow);
        Run("cancellation", TestCancellation);
        return 0;
    }

    private static void TestFifo()
    {
        var queue = new AndroidEventQueue(4);
        queue.Enqueue(new AndroidInputEvent(AndroidInputEventKind.Key, KeyCode: 1));
        queue.Enqueue(new AndroidInputEvent(AndroidInputEventKind.Text, Text: "a"));

        Assert(queue.TryDequeue(out AndroidInputEvent first) && first.KeyCode == 1, "first event was not FIFO");
        Assert(queue.TryDequeue(out AndroidInputEvent second) && second.Text == "a", "second event was not FIFO");
        Assert(!queue.TryDequeue(out _), "empty queue returned an event");
    }

    private static void TestOverflow()
    {
        var queue = new AndroidEventQueue(2);
        queue.Enqueue(new AndroidInputEvent(AndroidInputEventKind.Key, KeyCode: 1));
        queue.Enqueue(new AndroidInputEvent(AndroidInputEventKind.Key, KeyCode: 2));
        queue.Enqueue(new AndroidInputEvent(AndroidInputEventKind.Key, KeyCode: 3));

        Assert(queue.DroppedCount == 1, "overflow did not record a dropped event");
        Assert(queue.TryDequeue(out AndroidInputEvent first) && first.KeyCode == 2, "overflow did not drop oldest");
        Assert(queue.TryDequeue(out AndroidInputEvent second) && second.KeyCode == 3, "overflow did not preserve newest event");
    }

    private static void TestCancellation()
    {
        var queue = new AndroidEventQueue();
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        try
        {
            queue.DequeueAsync(cancellation.Token).AsTask().GetAwaiter().GetResult();
            throw new InvalidOperationException("cancelled dequeue completed");
        }
        catch (OperationCanceledException)
        {
        }
    }

    private static void Run(string name, Action test)
    {
        test();
        Console.WriteLine($"PASS {name}");
    }

    private static void Assert(bool condition, string message)
    {
        if (!condition)
            throw new InvalidOperationException(message);
    }
}
