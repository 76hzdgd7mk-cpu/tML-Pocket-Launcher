using System.Diagnostics;
using System.Reflection;
using Microsoft.Xna.Framework;
using MobileLauncher.Bootstrap.Compatibility;
using ReLogic.Graphics;
using Terraria;
using Terraria.GameContent;

namespace MobileLauncher.Patches.Rendering;

/// <summary>Measures completed swaps, including frames skipped by the simulation.</summary>
internal static class FpsDisplay
{
    private static long started;
    private static int frames;
    private static int rate;
    private static bool enabled;

    internal static void Install(List<IDisposable> hooks)
    {
        var draw = typeof(Main).GetMethod("DrawFPS", BindingFlags.Instance | BindingFlags.NonPublic)!;
        hooks.Add(new RuntimeMethodHook(draw, (_, next) =>
        {
            var result = next();
            if (rate > 0 && Main.spriteBatch is not null && FontAssets.MouseText.IsLoaded)
                Main.spriteBatch.DrawString(FontAssets.MouseText.Value, $"{rate} FPS",
                    new Vector2(Main.screenWidth - 110, 8), Color.White);
            return result;
        }));
        enabled = true;
    }

    internal static void AfterPresent()
    {
        if (!enabled) return;
        long now = Stopwatch.GetTimestamp();
        if (started == 0) started = now;
        frames++;
        double elapsed = (now - started) / (double)Stopwatch.Frequency;
        if (elapsed < 1) return;
        rate = (int)Math.Round(frames / elapsed);
        started = now;
        frames = 0;
    }
}
