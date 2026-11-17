# Bundled tML Android patches

Adapted from the user-supplied `D:/RotatingartLauncher/patches` on 2026-11-16. Upstream: RotatingartLauncher, GPL-3.0; full license in LICENSE. All adapted executable sources are supplied here. Upstream originals are unchanged.

| Upstream patch | Version | Launcher integration |
| --- | --- | --- |
| TModLoaderPatch | 1.2.0 | Existing Bootstrap imported-resource, social, logging, URL and platform adapters; no second base DLL |
| TModLoaderTouchPatch | 1.0.14 | Touch/: MonoMod-owned FNA polling, stable finger identity, Terraria pointer and cursor suppression |
| TModLoaderFullscreenPatch | 1.1.2 | Rendering/: EGL surface/drawable sync, fullscreen swap and actual first-frame notification |
| TModLoaderRenderScalePatch | 1.0.3 | Rendering/: cached base dimensions and TML_MOBILE_RENDER_SCALE |
| TModLoaderFrameRatePatch | 0.1.1 | FrameRate/: guarded native accumulator edits, 120 FPS foreground pacing, reload lifecycle; optional |
| MobileServerPatch | 0.1.0 | Hosting/: exact upstream MVID guard, rollback and integrated host lifecycle; optional/experimental |
| FPSDisplayPatch | 1.0.0 | Rendering/FpsDisplay: count actual successful presents and draw through the game's existing FPS layer; optional |
| ConsolePatch | 1.0.3 | Compatibility/: supported console properties, colors, clear/read-key/signal compatibility |

Harmony prefixes were adapted to the launcher's existing RuntimeMethodHook/MonoMod owner. Required hooks fail startup with diagnostics and roll back. Optional frame/hosting installations retain their upstream rollback. All are loaded from the fixed APK assembly path, never an imported DLL. Configuration changes apply on the next game launch.

The upstream console ReadLine infinite wait and custom stdin transport were deliberately excluded: this launcher has no stdin pipe. Existing logger/encoding ownership remains in Bootstrap. No upstream hash-verification bypass or desktop folder browser is installed; the launcher's Steam ownership gate and own file browser remain authoritative. Unrelated Everest/SMAPI/MonoGame patches are outside this tML migration.

Compile against a precompiled tML release using scripts/build/prepare-game-references.ps1. The project never copies game references to output. No game source build is involved. Preserve this notice and LICENSE with redistributed patch binaries.

The real-assembly runtime harness under managed/tests/MobileLauncher.Patches.RuntimeHarness adapts the upstream frame patch RuntimeHarness and the supplied MobileJoystick input-regressions tool. Native polling is capped at 1 kHz in the FNA wait loop; MobileJoystick retains event edges separately. No phone data is used by that harness.
