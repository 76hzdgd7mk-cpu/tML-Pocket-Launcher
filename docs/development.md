# Development

## Tools

- .NET SDK 10 (see `global.json`)
- JDK 21
- Android SDK Platform 37 and NDK 30.0.14904198 rc1
- CMake 3.22.1, Git and PowerShell
- Node.js 22+ and npm (the offline UI is built during Gradle preBuild)

Configure `JAVA_HOME` and `ANDROID_HOME` locally, or use an ignored `android/local.properties` with `sdk.dir`. Do not embed developer machine paths in committed files. Native dependency sources live under `external/`; managed game sources are not build inputs.

SDL3 is fetched at the commit pinned in `android/native/CMakeLists.txt`. An explicit `TML_SDL3_SOURCE_DIR` overrides it. When CMake is configured without that variable, the previous override is cleared and the pinned source is restored. CMake checks the SDL version and every JNI registration against the launcher's Java declarations and stops before compiling incompatible bindings. For a standalone check, run `scripts/checks/check-sdl-jni.ps1 -SdlSourcePath <SDL3 source directory>`.

## Commands

```powershell
# Native dependencies
git submodule update --init --recursive external/SDL external/FNA3D external/FAudio external/tML-Pocket-Patches external/tML-Pocket-Mods

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

The general patch assembly is checked out from `external/tML-Pocket-Patches`. The touch patch is built from `managed/MobileLauncher.Controls`. Both use this checkout's game references and MonoMod dependencies.

When preparing APK assets, the launcher script also passes `DirectoryBuildPropsPath` to the external patch build so it reads `managed/Directory.Build.props`. Android Studio does not need a shell environment variable for these shared settings.

The APK includes Android CoreCLR, launcher/store hosts, Android native libraries, and the official tModLoader 2026.09.3.1 release ZIP. Gradle downloads and verifies the release when preparing the APK. Use `-PdefaultTmlArchive=<absolute path>` to provide a previously downloaded copy of the same ZIP. On first launch, the launcher installs the bundled release if the user has no version history.

The app can download or import additional tML releases. Terraria imports accept Steam ZIPs and GOG Linux `.sh` installers. Downloads use SteamKit/GOG account authorization. Steam resources require a fresh online ownership check before launch. GOG resources require no login at launch.

Gradle also runs `scripts/build/prepare-launcher-ui.ps1` and packages the approved
UI under `assets/ui`. Source maps and the phone preview wrapper are excluded.
Run `npm test` and `npm run format:check` in `ui/launcher` for the browser suites,
including the native bridge, version-manager and resource-browser fixtures. The
resource suite covers real operation names with mocked responses, failed/retried
pagination, Workshop downloads, mod-pack operations and ten responsive sizes.
Set `LAUNCHER_CAPTURE=1` to save screenshots under ignored `build/ui-previews`.
These fixtures do not perform live downloads or establish device compatibility.
See [implemented Android paths and limits](android-launcher.md).

## Runtime validation

The optional mobile Terraria converter uses C++ and JNI on Android arm64. Build its profile
from the target tModLoader image layout and compiled shaders,
desktop Terraria sound and font inventory and XACT metadata, and the texture
fallback ZIP produced by `prepare-mobile-terraria-textures.ps1`.

```powershell
.\scripts\build\prepare-mobile-terraria-android.ps1 -OutputPath build/mobile-terraria-android-profile.zip -TargetTml 2026.09.3.1 -TerrariaContent $terrariaContent -TmlContent $tmlContent -ImageLayout $imageLayout -TextureFallback $textureFallback
$profile = (Resolve-Path build/mobile-terraria-android-profile.zip).Path
Push-Location android
.\gradlew.bat :app:installDebug :app:installDebugAndroidTest "-PmobileTerrariaProfile=$profile"
Pop-Location
adb shell am instrument -w app.com.tmlpocket.test/app.com.tmlpocket.feature.installation.MobileTerrariaConversionTest
```

To prepare mobile resources, select the profile's tModLoader version and use
**Games → Add game → Android Terraria → Convert resources**. The launcher
stores and selects the resulting files in `games/terraria-android`. Start the
game from **Home → Launch game**. The Installed tab can select desktop
Terraria resources again.

The instrumentation run reads the installed Terraria APK and checks the
converted file count and music bank. Its result includes the app-private output
path. Keep several GB free on the device for the converted content. The profile
is specific to the desktop target. The test build uses the mobile APK as the
source of music, sound effects, fonts, and available textures.

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
adb shell am start -n app.com.tmlpocket/app.com.tmlpocket.feature.launcher.ui.MainActivity
adb logcat -v time tMLPocketLauncher:I tMLPocketCoreClr:I tMLPocketNative:I tMLPocketStatus:I tMLPocketRenderers:I SDL:I tMLPocketIme:I libc:F DEBUG:F AndroidRuntime:E "*:S"
```

## Windows Java socket issue

If a Java stack trace shows `PipeImpl` → `UnixDomainSockets.connect` → `Invalid argument`, the host's Unix-domain socket support is failing before Gradle configuration. For that environment only, set `JAVA_TOOL_OPTIONS` to `-Djdk.net.unixdomain.tmpdir=<a nonexistent local directory>` so Java's selector falls back to TCP. Apply this locally and to child JVMs; it is not an application setting.

## Bundled touch mod and patch references

Use a precompiled Terraria 1.4.4.9 / tML 2026.09.3.1 release as `TML_REFERENCE_ROOT`, or stage it with the command above. The chosen source path is remembered only in ignored `build/game-references/source.txt`. Do not point it at the tML source checkout. The launcher's build compiles MobileJoystick and its own patch assembly, never the game or FNA.

Gradle bundles `MobileLauncher.Controls.dll` with its textures and localization, `MobileLauncher.Patches.dll` and upstream GPL text. The runtime harness checks attachment and removal against the real game assembly, embedded resources, frame pacing and touch input using synthetic contacts.
