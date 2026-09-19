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

    public void ShowToast(string message, bool longDuration = false)
    {
    }

    public bool HasPermission(string permission) => false;

    public void RequestPermission(string permission, int requestCode)
    {
    }

    public ValueTask<string?> PromptTextAsync(
        string title,
        bool password,
        CancellationToken cancellationToken = default) =>
        ValueTask.FromResult<string?>(null);

    public void PumpEvents()
    {
    }
}
