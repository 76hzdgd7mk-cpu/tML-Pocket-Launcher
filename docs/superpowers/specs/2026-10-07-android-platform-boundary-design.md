# tModLoader Android Platform Boundary Design

## Status

Approved in conversation for implementation.

## Goal

Make Android a first-class tModLoader platform boundary instead of treating it as a collection of resolution and Linux fallbacks. Android-specific behavior must be selected through one runtime platform identity and one bridge-backed capability interface.

## Scope

In scope:

- Keep `TML_ANDROID` as the Android build boundary for source and dependency selection.
- Use `ReLogic.OS.Platform.IsAndroid` as the tModLoader runtime platform check.
- Consolidate Android platform services for storage paths, URL launching, clipboard, orientation, fullscreen display size, IME, Toast, permissions, lifecycle, and event-queue access.
- Make tModLoader startup choose the current Android landscape display resolution and fullscreen mode through the Android platform branch.
- Route unsupported desktop behavior through explicit Android no-op or failure behavior rather than Linux/desktop assumptions.
- Preserve the existing SteamKit2 login, ownership, and content-download modules without refactoring their protocol flow.

Out of scope:

- Rewriting Steam authentication or CDN download behavior.
- Adding arbitrary Android file-picker or background-service support.
- Changing Windows, Linux, or macOS platform behavior.
- Changing Android system density or device resolution.

## Architecture

`TML_ANDROID` is compile-time only. It controls Android source inclusion, desktop dependency exclusions, and package output. Runtime game code uses `ReLogic.OS.Platform.IsAndroid`, which resolves to `PlatformType.Android` before the Linux fallback.

The Android platform implementation exposes a single `IAndroidPlatformServices` contract. `TmlAndroidBootstrap.Runtime.AndroidPlatformServiceProxy` adapts that contract to `IAndroidBridge`, and Kotlin/JNI implements the bridge against `GameActivity`, SDL, and the native Android event queue. tModLoader/ReLogic services consume the contract without referencing the launcher assembly.

The resolution path belongs to tModLoader's Android platform branch: it reads the current SDL landscape display mode, updates the in-memory display settings, and starts fullscreen. Existing desktop configuration loading remains unchanged outside Android.

## Capability Contract

The platform bridge must cover these behaviors:

- app-private files and cache directories;
- URL opening and clipboard access;
- landscape/portrait orientation;
- current display width and height plus fullscreen request;
- Android IME visibility and text events;
- Toast messages;
- permission checks and requests;
- lifecycle/focus/back/touch/key/text event queue access;
- explicit unsupported results for desktop console, recycle-bin, native Steam client, and external process operations.

## Verification

- Host build compiles the Android-targeted tModLoader assembly with `TML_ANDROID` and keeps desktop branches intact.
- Focused tests cover Android platform selection, service proxy dispatch, path confinement, and event delivery.
- Gradle arm64 APK build succeeds.
- Device logs report `PlatformType.Android`, Android service configuration, and a display mode matching the current landscape surface rather than `800x720`.
- Device UI confirms fullscreen rendering, touch/key/text event delivery, IME requests, and launcher lifecycle behavior.
- Existing Steam login/content tests and device content preparation remain unchanged and passing.
- `git diff --check` passes.
