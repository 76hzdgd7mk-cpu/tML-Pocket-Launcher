namespace TmlAndroidBootstrap.Android;

public interface IAndroidBridge
{
    string FilesDirectory { get; }

    string CacheDirectory { get; }

    void RunOnUiThread(Action action);

    bool OpenUrl(string url);

    string? GetClipboardText();

    void SetClipboardText(string text);

    void SetOrientation(bool landscape);

    void SetImeVisible(bool visible);

    AndroidEventQueue Events { get; }
}
