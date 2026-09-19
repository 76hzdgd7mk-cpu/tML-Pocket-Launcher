using System.Reflection;
using TmlAndroidBootstrap.Android;

namespace TmlAndroidBootstrap.Runtime;

/// <summary>
/// Adapts the bootstrap bridge to the Android platform service interface compiled
/// into tModLoader without making the upstream assembly reference this project.
/// </summary>
public sealed class AndroidPlatformServiceProxy : DispatchProxy, IDisposable
{
    private IAndroidBridge? _bridge;
    private Action<char>? _imeListener;
    private CancellationTokenSource? _eventPumpCancellation;
    private Task? _eventPump;

    public static AndroidPlatformServiceProxy? TryConfigure(
        Assembly tModLoaderAssembly,
        IAndroidBridge bridge)
    {
        ArgumentNullException.ThrowIfNull(tModLoaderAssembly);
        ArgumentNullException.ThrowIfNull(bridge);

        var servicesType = tModLoaderAssembly.GetType("ReLogic.OS.AndroidPlatformServices")
            ?? Type.GetType("ReLogic.OS.AndroidPlatformServices, ReLogic", throwOnError: false);
        var interfaceType = servicesType?.Assembly.GetType("ReLogic.OS.IAndroidPlatformServices");
        var configure = servicesType?.GetMethod(
            "Configure",
            BindingFlags.Public | BindingFlags.Static,
            binder: null,
            new[] { interfaceType! },
            modifiers: null);
        if (servicesType is null || interfaceType is null || configure is null)
            return null;

        var proxy = (AndroidPlatformServiceProxy)DispatchProxy.Create(
            interfaceType,
            typeof(AndroidPlatformServiceProxy));
        proxy._bridge = bridge;
        configure.Invoke(null, new object?[] { proxy });
        return proxy;
    }

    public void Dispose()
    {
        _eventPumpCancellation?.Cancel();
        try
        {
            _eventPump?.Wait(TimeSpan.FromSeconds(1));
        }
        catch (AggregateException)
        {
            // The game is already tearing down; the event pump is best effort.
        }
        _eventPumpCancellation?.Dispose();
        _eventPumpCancellation = null;
        _eventPump = null;
        _imeListener = null;
        _bridge = null;
    }

    protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
    {
        if (targetMethod is null)
            throw new MissingMethodException("Android platform service method was not resolved.");

        var bridge = _bridge ?? throw new ObjectDisposedException(nameof(AndroidPlatformServiceProxy));
        var name = targetMethod.Name;
        if (targetMethod.IsSpecialName && name == "get_FilesDirectory")
            return bridge.FilesDirectory;
        if (targetMethod.IsSpecialName && name == "get_CacheDirectory")
            return bridge.CacheDirectory;

        return name switch
        {
            "OpenUrl" => bridge.OpenUrl((string)args![0]!),
            "GetClipboardText" => bridge.GetClipboardText() ?? string.Empty,
            "SetClipboardText" => SetClipboard(bridge, (string)args![0]!),
            "SetOrientation" => SetOrientation(bridge, (bool)args![0]! ),
            "SetImeVisible" => SetImeVisible(bridge, (bool)args![0]! ),
            "AddImeTextListener" => AddImeTextListener((Action<char>)args![0]!),
            "RemoveImeTextListener" => RemoveImeTextListener((Action<char>)args![0]!),
            _ => throw new NotSupportedException($"Unsupported Android platform service: {name}")
        };
    }

    private static object? SetClipboard(IAndroidBridge bridge, string text)
    {
        bridge.SetClipboardText(text);
        return null;
    }

    private static object? SetOrientation(IAndroidBridge bridge, bool landscape)
    {
        bridge.SetOrientation(landscape);
        return null;
    }

    private object? SetImeVisible(IAndroidBridge bridge, bool visible)
    {
        bridge.SetImeVisible(visible);
        if (visible)
            StartEventPump(bridge);
        return null;
    }

    private object? AddImeTextListener(Action<char> listener)
    {
        _imeListener += listener;
        if (_bridge is not null)
            StartEventPump(_bridge);
        return null;
    }

    private object? RemoveImeTextListener(Action<char> listener)
    {
        _imeListener -= listener;
        return null;
    }

    private void StartEventPump(IAndroidBridge bridge)
    {
        if (_eventPump is { IsCompleted: false })
            return;

        _eventPumpCancellation?.Dispose();
        _eventPumpCancellation = new CancellationTokenSource();
        var cancellationToken = _eventPumpCancellation.Token;
        _eventPump = Task.Run(async () =>
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                bridge.PumpEvents();
                var events = bridge.Events;
                while (events.TryDequeue(out var inputEvent))
                {
                    if (inputEvent.Kind != AndroidInputEventKind.Text || _imeListener is null)
                        continue;

                    foreach (var character in inputEvent.Text ?? string.Empty)
                        _imeListener(character);
                }

                await Task.Delay(TimeSpan.FromMilliseconds(8), cancellationToken)
                    .ConfigureAwait(false);
            }
        }, cancellationToken);
    }
}
