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

    void ShowToast(string message, bool longDuration = false);

    bool HasPermission(string permission);

    void RequestPermission(string permission, int requestCode);

    ValueTask<string?> PromptTextAsync(
        string title,
        bool password,
        CancellationToken cancellationToken = default);

    void PumpEvents();

    AndroidEventQueue Events { get; }
}
