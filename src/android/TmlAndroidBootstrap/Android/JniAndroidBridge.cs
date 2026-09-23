using System.Runtime.InteropServices;

namespace TmlAndroidBootstrap.Android;

/// <summary>
/// CoreCLR-side Android bridge. The native library is loaded by SDLActivity before
/// the managed host starts, so this stays independent of Xamarin or Android.Runtime.
/// </summary>
public sealed class JniAndroidBridge : IAndroidBridge
{
    private readonly AndroidEventQueue _events;

    public JniAndroidBridge(
        string filesDirectory,
        string cacheDirectory,
        int eventCapacity = 512)
    {
        FilesDirectory = Path.GetFullPath(filesDirectory);
        CacheDirectory = Path.GetFullPath(cacheDirectory);
        _events = new AndroidEventQueue(eventCapacity);
    }

    public string FilesDirectory { get; }

    public string CacheDirectory { get; }

    public AndroidEventQueue Events
    {
        get
        {
            PumpEvents();
            return _events;
        }
    }

    public void RunOnUiThread(Action action)
    {
        ArgumentNullException.ThrowIfNull(action);
        // UI-only operations below are dispatched by Kotlin. Arbitrary managed
        // delegates cannot safely cross the CoreCLR/JNI boundary.
        action();
    }

    public bool OpenUrl(string url)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(url);
        return NativeMethods.OpenUrl(url) == 0;
    }

    public string? GetClipboardText()
    {
        var pointer = NativeMethods.GetClipboardText();
        return pointer == IntPtr.Zero ? null : Marshal.PtrToStringUTF8(pointer);
    }

    public void SetClipboardText(string text)
    {
        ArgumentNullException.ThrowIfNull(text);
        ThrowOnFailure(NativeMethods.SetClipboardText(text), "set clipboard text");
    }

    public void SetOrientation(bool landscape) =>
        ThrowOnFailure(NativeMethods.SetOrientation(landscape ? 1 : 0), "set orientation");

    public void SetImeVisible(bool visible) =>
        ThrowOnFailure(NativeMethods.SetImeVisible(visible ? 1 : 0), "set IME visibility");

    public void ShowToast(string message, bool longDuration = false)
    {
        ArgumentNullException.ThrowIfNull(message);
        ThrowOnFailure(NativeMethods.ShowToast(message, longDuration ? 1 : 0), "show toast");
    }

    public void SetStartupStatus(string title, string detail, int progressPercent = -1)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(title);
        ArgumentNullException.ThrowIfNull(detail);
        if (progressPercent is < -1 or > 100)
            throw new ArgumentOutOfRangeException(nameof(progressPercent));

        ThrowOnFailure(
            NativeMethods.SetStartupStatus(title, detail, progressPercent),
            "update startup status");
    }

    public void HideStartupStatus() =>
        ThrowOnFailure(NativeMethods.HideStartupStatus(), "hide startup status");

    public bool HasPermission(string permission)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(permission);
        return NativeMethods.HasPermission(permission) != 0;
    }

    public void RequestPermission(string permission, int requestCode)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(permission);
        ThrowOnFailure(
            NativeMethods.RequestPermission(permission, requestCode),
            "request Android permission");
    }

    public async ValueTask<string?> PromptTextAsync(
        string title,
        bool password,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(title);
        var requestCode = Interlocked.Increment(ref _nextPromptRequestCode);
        ThrowOnFailure(
            NativeMethods.BeginTextPrompt(title, password ? 1 : 0, requestCode),
            "show text prompt");

        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            PumpEvents();
            var deferred = new List<AndroidInputEvent>();
            while (_events.TryDequeue(out var inputEvent))
            {
                if (inputEvent.Kind == AndroidInputEventKind.Text &&
                    inputEvent.RequestCode == requestCode)
                {
                    foreach (var pending in deferred)
                        _events.Enqueue(pending);
                    return inputEvent.Text;
                }
                deferred.Add(inputEvent);
            }

            foreach (var pending in deferred)
                _events.Enqueue(pending);
            await Task.Delay(16, cancellationToken).ConfigureAwait(false);
        }
    }

    public ValueTask<AndroidLauncherAction> WaitForLauncherActionAsync(
        CancellationToken cancellationToken = default) =>
        throw new NotSupportedException("Launcher action transport is not implemented yet.");

    public void PumpEvents()
    {
        while (NativeMethods.TryDequeueEvent(out var nativeEvent) != 0)
        {
            var text = nativeEvent.Text == IntPtr.Zero
                ? null
                : Marshal.PtrToStringUTF8(nativeEvent.Text);

            _events.Enqueue(new AndroidInputEvent(
                Kind: (AndroidInputEventKind)nativeEvent.Kind,
                TimestampNanos: nativeEvent.TimestampNanos,
                Text: text,
                KeyCode: nativeEvent.KeyCode,
                Pressed: nativeEvent.Pressed != 0,
                PointerId: nativeEvent.PointerId,
                X: nativeEvent.X,
                Y: nativeEvent.Y,
                Action: nativeEvent.Action,
                Focused: nativeEvent.Focused != 0,
                Paused: nativeEvent.Paused != 0,
                RequestCode: nativeEvent.RequestCode,
                Granted: nativeEvent.Granted != 0));
        }
    }

    private static void ThrowOnFailure(int result, string operation)
    {
        if (result != 0)
            throw new InvalidOperationException($"Android bridge failed to {operation} (native result {result}).");
    }

    private int _nextPromptRequestCode = 10_000;

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeAndroidEvent
    {
        public int Kind;
        public int Action;
        public long TimestampNanos;
        public int KeyCode;
        public int PointerId;
        public float X;
        public float Y;
        public int Pressed;
        public int Focused;
        public int Paused;
        public int RequestCode;
        public int Granted;
        public IntPtr Text;
    }

    private static class NativeMethods
    {
        [DllImport("main", EntryPoint = "fna_android_bridge_open_url")]
        public static extern int OpenUrl([MarshalAs(UnmanagedType.LPUTF8Str)] string url);

        [DllImport("main", EntryPoint = "fna_android_bridge_get_clipboard_text")]
        public static extern IntPtr GetClipboardText();

        [DllImport("main", EntryPoint = "fna_android_bridge_set_clipboard_text")]
        public static extern int SetClipboardText([MarshalAs(UnmanagedType.LPUTF8Str)] string text);

        [DllImport("main", EntryPoint = "fna_android_bridge_set_orientation")]
        public static extern int SetOrientation(int landscape);

        [DllImport("main", EntryPoint = "fna_android_bridge_set_ime_visible")]
        public static extern int SetImeVisible(int visible);

        [DllImport("main", EntryPoint = "fna_android_bridge_show_toast")]
        public static extern int ShowToast([MarshalAs(UnmanagedType.LPUTF8Str)] string message, int longDuration);

        [DllImport("main", EntryPoint = "fna_android_bridge_set_startup_status")]
        public static extern int SetStartupStatus(
            [MarshalAs(UnmanagedType.LPUTF8Str)] string title,
            [MarshalAs(UnmanagedType.LPUTF8Str)] string detail,
            int progressPercent);

        [DllImport("main", EntryPoint = "fna_android_bridge_hide_startup_status")]
        public static extern int HideStartupStatus();

        [DllImport("main", EntryPoint = "fna_android_bridge_has_permission")]
        public static extern int HasPermission([MarshalAs(UnmanagedType.LPUTF8Str)] string permission);

        [DllImport("main", EntryPoint = "fna_android_bridge_request_permission")]
        public static extern int RequestPermission(
            [MarshalAs(UnmanagedType.LPUTF8Str)] string permission,
            int requestCode);

        [DllImport("main", EntryPoint = "fna_android_bridge_begin_text_prompt")]
        public static extern int BeginTextPrompt(
            [MarshalAs(UnmanagedType.LPUTF8Str)] string title,
            int password,
            int requestCode);

        [DllImport("main", EntryPoint = "fna_android_bridge_poll_event")]
        public static extern int TryDequeueEvent(out NativeAndroidEvent value);
    }
}
