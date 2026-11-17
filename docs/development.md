# Development

## Tools

- .NET SDK 10 (see `global.json`)
- JDK 21
- Android SDK Platform 37 and NDK 30.0.14904198 rc1
- CMake 3.22.1, Git and PowerShell
- Node.js 22+ and npm (the offline UI is built during Gradle preBuild)

Configure `JAVA_HOME` and `ANDROID_HOME` locally, or use an ignored `android/local.properties` with `sdk.dir`. Do not embed developer machine paths in committed files. Native dependency sources live under `external/`; managed game sources are not build inputs.

## Commands

```powershell
# Native dependencies
git submodule update --init --recursive external/SDL external/FNA3D external/FAudio

# Managed projects and tests
.\scripts\build\prepare-game-references.ps1 -TmlRoot '<installed precompiled tModLoader release>'
dotnet build MobileLauncher.slnx -c Release
dotnet test MobileLauncher.slnx -c Release
.\scripts\checks\check-patch-runtime.ps1

# All repository checks
.\scripts\checks\verify.ps1

# Android application (publishes only launcher-managed code)
Push-Location android
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug --console=plain
Pop-Location

# Inspect the generated APK
.\scripts\checks\check-apk.ps1 -ApkPath android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk
```

The APK includes Android CoreCLR, the launcher/store managed hosts and Android native libraries. It must not contain tModLoader.dll, FNA.dll or Terraria Content. The app downloads official tML ZIPs from GitHub Releases or imports local ZIPs. Terraria imports accept Steam ZIPs and GOG Linux `.sh` installers; downloads use SteamKit/GOG account authorization. Steam resources require a fresh online ownership check before launch; GOG resources require no login at launch.

Gradle also runs `scripts/build/prepare-launcher-ui.ps1` and packages the approved
UI under `assets/ui`. Source maps and the phone preview wrapper are excluded.
Run `npm test` and `npm run format:check` in `ui/launcher` for the seven browser suites,
including the native bridge fixture. See [implemented Android paths and limits](android-launcher.md).

## Runtime validation

Install the APK, import Terraria Content, select/download or import tML, and launch. Confirm the game reaches its main menu, then test touch controls, text input and a second launch. Existing tests and package checks validate infrastructure; they do not establish compatibility with every tML release.

For account transport validation, use an account owning Terraria from Games >
Accounts. Complete Steam Guard or the separate GOG official login page on the
device; do not put passwords/codes in scripts or logs. Verify ownership, download,
cancellation, installation rollback on failure and token restore after reopening.
The automated fixture does not establish successful live authentication. Store
protocol code is in `managed/MobileLauncher.Stores`; Android token/runtime glue is
in `feature/stores`. Run managed tests before the Gradle build, since both restore
and publish the same projects and must not run concurrently against the same obj.

```powershell
adb install -r android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk
adb shell am start -n com.example.fnatemplate/dev.tml.mobilelauncher.feature.launcher.ui.MainActivity
adb logcat -s FnaAndroidCoreClr SDL
```

## Windows Java socket issue

If a Java stack trace shows `PipeImpl` → `UnixDomainSockets.connect` → `Invalid argument`, the host's Unix-domain socket support is failing before Gradle configuration. For that environment only, set `JAVA_TOOL_OPTIONS` to `-Djdk.net.unixdomain.tmpdir=<a nonexistent local directory>` so Java's selector falls back to TCP. Apply this locally and to child JVMs; it is not an application setting.

## Bundled touch mod and patch references

Use a precompiled Terraria 1.4.4.9 / tML 2026.09.3.1 release as `TML_REFERENCE_ROOT`, or stage it with the command above. The chosen source path is remembered only in ignored `build/game-references/source.txt`. Do not point it at the tML source checkout. The launcher's build compiles MobileJoystick and its own patch assembly, never the game or FNA.

Gradle uses the normal tML packager to convert mod textures with isolated `build/mod-packaging-userdata`. It bundles `launcher/BuiltinMods/MobileJoystick.tmod`, `MobileLauncher.Patches.dll` and the upstream GPL text. The real-assembly runtime harness adapts upstream frame-pacing checks and MobileJoystick input regressions; it exercises the existing game assembly's accumulator, hook rollback/reload, rapid taps, dual-contact move/aim, sustained attack and release using synthetic state, without creating any worlds. It does not establish real-device multiplayer interoperability or a sustained hardware frame rate.
