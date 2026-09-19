namespace TmlAndroidBootstrap.Android;

public sealed class NullAndroidBridge : IAndroidBridge
{
    public NullAndroidBridge(string filesDirectory, string cacheDirectory, AndroidEventQueue? events = null)
    {
        FilesDirectory = Path.GetFullPath(filesDirectory);
        CacheDirectory = Path.GetFullPath(cacheDirectory);
        Events = events ?? new AndroidEventQueue();
    }

    public string FilesDirectory { get; }

    public string CacheDirectory { get; }

    public AndroidEventQueue Events { get; }

    public void RunOnUiThread(Action action) => action();

    public bool OpenUrl(string url) => false;

    public string? GetClipboardText() => null;

    public void SetClipboardText(string text)
    {
    }

    public void SetOrientation(bool landscape)
    {
    }

    public void SetImeVisible(bool visible)
    {
    }
}
