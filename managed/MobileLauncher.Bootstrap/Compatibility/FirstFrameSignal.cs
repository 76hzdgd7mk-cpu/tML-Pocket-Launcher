namespace MobileLauncher.Bootstrap.Compatibility;

/// <summary>Only a successful presentation may dismiss the startup surface.</summary>
public sealed class FirstFrameSignal(Action notify)
{
    private int signaled;

    public object? AfterPresent(Func<object?> present)
    {
        var result = present();
        if (Interlocked.CompareExchange(ref signaled, 1, 0) == 0)
        {
            try { notify(); }
            catch (Exception error)
            {
                Volatile.Write(ref signaled, 0);
                Console.Error.WriteLine($"[Startup] First frame notification failed: {error.Message}");
            }
        }
        return result;
    }
}
