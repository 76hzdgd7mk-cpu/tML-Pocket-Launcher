# tModLoader-FNA-Android

Android CoreCLR host for a single tModLoader game process, based on the FNA
Android template. tModLoader stays on `net8.0`; the APK supplies a .NET 10
CoreCLR runtime and launches the managed game in the same process as Android.

This repository contains Android patches and host code, not Terraria source or
Terraria content. A user-owned Terraria installation is prepared locally from
`D:\tModLoader\src` and, on the device, missing content is downloaded only
after Steam login and ownership validation for App ID `105600`.

## Layout

```text
platforms/android/                 Gradle app, SDL, JNI, CoreCLR host
src/android/TmlAndroidBootstrap/    CoreCLR bootstrap and Android bridge
src/android/TmlAndroidContent/      SteamKit2 auth, ownership, CDN download
src/android/TmlAndroidHost/         Android startup and content preparation
patches/android/                    tModLoader Android source patches
third_party/tModLoader/             pinned upstream source input
external/                           FNA, SDL, FNA3D, and FAudio submodules
```

## Requirements

- .NET SDK 10.0.101 or compatible .NET 10 SDK
- JDK 21
- Android SDK Platform 37
- Android NDK 30.0.14904198 rc1
- CMake 3.22.1
- Git and `adb`
- A prepared `D:\tModLoader\src` containing `WorkspaceInfo.targets`

## Build

Run from the repository root:

```powershell
$env:HTTP_PROXY = 'http://127.0.0.1:7890'
$env:HTTPS_PROXY = 'http://127.0.0.1:7890'
Push-Location platforms/android
.\gradlew.bat :app:assembleDebug --no-daemon
Pop-Location
.\platforms\android\scripts\check-apk-assets.ps1 `
  -ApkPath platforms/android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk
```

The APK is `arm64-v8a` and contains CoreCLR, SDL/FNA native libraries,
`TmlAndroidHost.dll`, and generated tModLoader assemblies. It does not contain
Terraria `Content`.

## Android startup

1. `GameActivity` loads SDL and the native JNI host.
2. CoreCLR starts `TmlAndroidHost.dll` once.
3. The host loads or creates an Android Keystore-backed Steam session.
4. SteamKit2 verifies Terraria `105600` ownership and downloads content to
   app-private storage when needed.
5. `tModLoader.dll` is loaded and invoked in the same CoreCLR process.

The bridge exposes Toast, clipboard, URL launch, orientation, SDL IME, runtime
permissions, lifecycle/input events, Steam Guard prompts, and encrypted Steam
credential storage. SDL remains responsible for its native rendering and input
pipeline; the managed queue receives a bounded mirror for platform services.

## Install and run

```powershell
adb install -r platforms/android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk
adb shell am start -n com.example.fnatemplate/.MainActivity
adb logcat -s FnaAndroidCoreClr SDL
```

The first launch prompts for Steam credentials and Steam Guard when Terraria
content is absent. The password is used only for that login and is not stored.
Clear app data to remove the Keystore session and downloaded content:

```powershell
adb shell pm clear com.example.fnatemplate
```

## Legal boundary

Use this project only with a Steam account that owns Terraria. Do not commit,
redistribute, or place Terraria source or content in the repository, APK, or
release artifacts. See [`docs/steam-content.md`](docs/steam-content.md).

## Verification boundary

Managed builds, tModLoader source preparation, native CMake, Gradle packaging,
APK asset checks, and offline tests are verified locally. Real CoreCLR startup,
Steam login, content download, rendering, and touch/input behavior still require
an arm64 Android device or emulator and fresh `adb` logs.
