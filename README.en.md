# tML Pocket Launcher

**An Android launcher for precompiled tModLoader releases.** Import legitimately obtained Terraria resources, select a tML release, manage mods and launch through SDL, FNA's native backends and Android CoreCLR.

[简体中文](README.md) · [Documentation](docs/README.md) · [Development](docs/development.md) · [Issues](https://github.com/FireworkSky/tML-Pocket-Launcher/issues)

## Status

Experimental, targeting **Android 9 / API 28+ on arm64-v8a**. A physical device reached the game menu with tML `2026.09.3.1`, Terraria `1.4.4.9` resources and the bundled MobileJoystick client mod. This does not establish compatibility with every device, release, mod, world or multiplayer setup.

This is an independent community project, not an official Re-Logic, tModLoader, Valve or GOG product.

## Features

- Import Steam Terraria ZIPs and GOG Linux `.sh` installers through the launcher's own file browser.
- Browse and download official tML GitHub release packages, or import a complete local release ZIP.
- SteamKit2 login, Steam Guard, entitlement verification and Terraria resource transport.
- Official GOG web authorization, version selection and Linux installer downloads.
- Read `.tmod` metadata without loading the game; search, enable, disable, check dependencies and manage mod packs.
- Browse Workshop and retrieve public metadata/CDN files where anonymous transport is available.
- Bundled MobileJoystick `0.1.4` for touch controls and in-game layout editing.
- Built-in Android adapters, render scaling and optional FPS/120 FPS/experimental hosting patches.
- Landscape and portrait launcher layouts, themes, custom backgrounds, motion settings and launch logs.

Steam resources require an online login and fresh Terraria entitlement check before each launch. Imported GOG resources do not require login at launch. Steam authentication was verified on-device; owned-account GOG authentication and complete paid-resource transfers still require live validation.

## Boundaries

The launcher builds its own host, compatibility patches and bundled touch mod. It **does not compile tModLoader or managed FNA**, and the APK must not contain `tModLoader.dll`, managed `FNA.dll` or Terraria Content. Users supply game packages separately.

Only one active tML distribution is currently installed. Authenticated Workshop UGC transport, GOG multipart installers and downloads resumed after process death are not supported. Optional hosting and high-frame-rate settings remain experimental. Ordinary browser mode uses demonstration state; Android uses device state.

## Build

The maintained scripts use Windows and PowerShell. Install .NET SDK 10, JDK 21 or a compatible Android Studio JBR, Android Platform 37, NDK `30.0.14904198 rc1`, CMake `3.22.1`, Git and Node.js 22+ with npm. Configure local SDK/JDK paths.

```powershell
git clone --recurse-submodules https://github.com/FireworkSky/tML-Pocket-Launcher.git tML-Pocket-Launcher
Set-Location tML-Pocket-Launcher
.\scripts\build\prepare-game-references.ps1 -TmlRoot '<precompiled tModLoader installation>'
.\scripts\checks\verify.ps1 -Android -Assemble
```

Use precompiled tML `2026.09.3.1` / Terraria `1.4.4.9` references for the bundled mod and patches. References are staged only in ignored local build output. The debug APK is written to `android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk`.

For the browser preview, run `npm ci` and `npm run dev` in `ui/launcher`, then visit `http://127.0.0.1:8769/preview.html`. Run `npm test` for seven browser suites. See [development](docs/development.md) and [Android behavior and limitations](docs/android-launcher.md).

## Layout

| Directory         | Responsibility                                                        |
| ----------------- | --------------------------------------------------------------------- |
| `android/`        | Kotlin/Java application, native host, JNI and JVM tests               |
| `managed/`        | C# host, compatibility, stores, bundled patches/mod and managed tests |
| `ui/launcher/`    | Offline React/TypeScript UI                                           |
| `scripts/build/`  | Launcher asset preparation                                            |
| `scripts/checks/` | Structure, runtime, test and APK checks                               |
| `external/`       | Native submodules and Android MonoMod assemblies                      |
| `docs/`           | User, architecture, development and branding documentation            |

## Contributing and licensing

Read [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Report issues with device/version information and sanitized logs. Do not upload credentials or game resources.

Components retain their respective licenses; this repository is not covered by a blanket MIT license. Migrated patches retain GPL-3.0, SteamKit2 is LGPL-2.1, and Animate UI includes the Commons Clause. The supplied MobileJoystick source has no separate LICENSE; this project does not grant new rights on its behalf. Terraria assets and third-party marks remain owned by their respective rights holders.
