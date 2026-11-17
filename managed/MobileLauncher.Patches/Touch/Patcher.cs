namespace MobileLauncher.Patches.Touch;

/// <summary>Bounded diagnostics; all touch reads remain on the game thread.</summary>
internal static class Patcher
{
    private static readonly Dictionary<string, long> NextSample = new();
    internal static void Log(string message) => Console.WriteLine($"[MobileTouch] {message}");
    internal static void Trace(string stage, Func<string> details, bool edge = false)
    {
        long now = Environment.TickCount64;
        if (NextSample.TryGetValue(stage, out long next) && now < next) return;
        NextSample[stage] = now + (edge ? 100 : 5000);
        Log($"{stage}: {details()}");
    }
}
