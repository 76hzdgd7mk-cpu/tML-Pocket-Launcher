using System.Reflection;
using Microsoft.Xna.Framework.Graphics;
using MobileLauncher.Bootstrap.Compatibility;
using MobileLauncher.Bootstrap.Platform;
using MobileLauncher.Patches.Rendering;

namespace MobileLauncher.Patches;

/// <summary>Owns only the allowlisted adapters shipped in the APK, never imported patch DLLs.</summary>
public sealed class PatchSession : IDisposable
{
    private readonly List<IDisposable> hooks = new();

    public static IDisposable Initialize(Assembly game, IAndroidBridge bridge)
    {
        var session = new PatchSession();
        try
        {
            Touch.TouchInputPatch.Apply(session.hooks, game);
            Compatibility.ConsoleCompatibility.Install(session.hooks);
            session.InstallRendering(bridge);
            var enabled = (Environment.GetEnvironmentVariable("TML_MOBILE_PATCHES") ?? "")
                .Split(',', StringSplitOptions.RemoveEmptyEntries).ToHashSet(StringComparer.Ordinal);
            if (enabled.Contains("mobile-fps")) FpsDisplay.Install(session.hooks);
            // The frame timing lifecycle must wrap hosting's lifecycle during reloads.
            if (enabled.Contains("mobile-hosting") && Hosting.Patcher.Initialize(IntPtr.Zero, 0) != 0)
                bridge.ShowToast("联机托管补丁安装失败，已回退为普通客户端");
            if (enabled.Contains("mobile-framerate") && FrameRate.Patcher.Initialize(IntPtr.Zero, 0) != 0)
                bridge.ShowToast("高帧率补丁安装失败，已回退为原生帧率");
            Console.WriteLine($"[MobilePatches] Ready; required=touch,fullscreen,console,resources; optional={string.Join(',', enabled)}.");
            return session;
        }
        catch
        {
            session.Dispose();
            throw;
        }
    }

    private void InstallRendering(IAndroidBridge bridge)
    {
        var firstFrame = new FirstFrameSignal(bridge.HideStartupStatus);
        const BindingFlags flags = BindingFlags.Public | BindingFlags.Instance;
        // The overload with GraphicsAdapter owns the reset; patching both overloads
        // would scale the same buffer twice.
        var reset = typeof(GraphicsDevice).GetMethod("Reset", flags, null,
            new[] { typeof(PresentationParameters), typeof(GraphicsAdapter) }, null)!;
        hooks.Add(new RuntimeMethodHook(reset, (args, next) =>
        {
            var device = (GraphicsDevice)args[0];
            var parameters = (PresentationParameters)args[1];
            FullscreenPresentPatch.ResetPrefix(parameters);
            RenderScalePatch.ResetPrefix(device, parameters);
            return next();
        }));
        // FNA's Game.EndDraw calls the parameterless overload directly; it does
        // not delegate to Present(Rectangle?, Rectangle?, IntPtr).
        var present = typeof(GraphicsDevice).GetMethod("Present", flags, null, Type.EmptyTypes, null)!;
        hooks.Add(new RuntimeMethodHook(present, (args, next) =>
        {
            bool useOriginal = FullscreenPresentPatch.PresentPrefix((GraphicsDevice)args[0], out bool presented);
            object result = null;
            if (useOriginal) { result = next(); presented = true; }
            if (presented)
            {
                FpsDisplay.AfterPresent();
                firstFrame.AfterPresent(() => null);
            }
            return result;
        }));
    }

    public void Dispose()
    {
        FrameRate.Patcher.Shutdown();
        Hosting.Patcher.Shutdown();
        for (int index = hooks.Count - 1; index >= 0; index--) hooks[index].Dispose();
        hooks.Clear();
    }
}
