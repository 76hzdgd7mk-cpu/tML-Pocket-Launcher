# tModLoader Android Native Resolution Design

## Status

Design approved in conversation and written for review before implementation.

## Goal

Make the Android tModLoader build use the phone's current landscape display resolution as its default game resolution, instead of inheriting the desktop configuration value such as `800x720`.

## Scope

- Change only the Android branch of tModLoader's display initialization.
- Read the current SDL display mode at startup so the behavior adapts to different phones and orientations.
- Set the Android startup mode to fullscreen and use the detected width and height for `DisplayWidth` and `DisplayHeight`.
- Keep Windows, Linux, and macOS resolution and configuration behavior unchanged.
- Preserve the existing Android CoreCLR, FNA, SDL, and MonoMod launch path.

Out of scope:

- Adding a new in-game resolution picker.
- Changing the phone's Android system resolution or density.
- Hardcoding the current device's `2400x1080` dimensions.
- Reworking FNA's rendering pipeline or the Android launcher UI.

## Runtime Design

The change is applied in the tModLoader `Main.LoadSettings()` path after SDL display modes have been queried and before `LastLoadedResolution` is assigned. On Android, the selected SDL display mode becomes the effective `DisplayWidth` and `DisplayHeight`, and `startFullscreen` is set to `true`. The in-memory configuration is updated with the same dimensions because `FullscreenStartup()` reads those keys again before calling `SetDisplayMode`.

The existing `SetDisplayMode` path then updates `graphics.PreferredBackBufferWidth`, `graphics.PreferredBackBufferHeight`, `Main.screenWidth`, and `Main.screenHeight` together. The resulting game window remains the existing SDL Android surface, while FNA and tModLoader use the full surface dimensions for rendering and UI layout.

If SDL cannot return a valid display mode, the original tModLoader configuration path remains the fallback. No desktop platform branch is changed.

## Patch and Build Integration

The change will be stored as a small ordered patch under `patches/android/`, applied by `scripts/prepare-tmodloader-source.ps1`. The generated source under `build/tmodloader-src` is build output and will not be edited directly.

The existing Gradle `prepareGameAssets` task will rebuild tModLoader and package the resulting assembly into the APK. No new runtime dependency is required.

## Verification

1. Apply the patch and run the existing source preparation check.
2. Build the arm64 debug APK with `:app:assembleDebug` and confirm `BUILD SUCCESSFUL`.
3. Install with `adb install -r` without clearing application data.
4. Launch tModLoader and inspect `files/game/tModLoader-Logs/client.log`.
5. Confirm the log reports the physical landscape resolution, for example `DisplayMode: {{Width:2400 Height:1080 ...}}` and `Width: 2400, Height: 1080, Fullscreen: True` or the equivalent FNA/tModLoader startup state.
6. Confirm the Android launcher overlay is gone and the game renders across the full display without the prior `800x720` startup size.
7. Run `git diff --check`.
