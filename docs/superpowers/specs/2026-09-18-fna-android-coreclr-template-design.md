# FNA Android CoreCLR Template Design

## Status

Approved design for implementation. Target platform is arm64-v8a on Android API 28 and newer.

## Goal

Create a single-game Android template that contains:

- A Kotlin/SDL Android host.
- A C++ JNI and hostfxr bridge for .NET 10 CoreCLR.
- Native SDL2, FNA3D, and FAudio libraries built with CMake.
- A minimal FNA C# sample targeting `net10.0`.
- A reproducible build that publishes the sample assembly and packages it into the APK.

The template is intended for replacing the sample game with one game project. It is not a multi-game launcher.

## Constraints

- ABI: `arm64-v8a` only.
- Android: API 28+.
- Managed runtime: .NET 10 CoreCLR, hosted through `hostfxr`.
- Rendering/input: SDL2 and FNA3D.
- Audio: FAudio.
- Native build: Android NDK and CMake through the Gradle Android plugin.
- The game is a normal IL assembly, not NativeAOT.
- Game files and runtime files are copied from APK assets to app-private writable storage before launch.

## Architecture

```text
GameActivity (:game process)
        |
        v
SDL Android surface and input
        |
        v
Kotlin runtime/bootstrap code
        |
        v
JNI shared library
        |
        +--> SDL2 / FAudio / FNA3D
        |
        v
hostfxr -> CoreCLR 10 -> FNA sample assembly
```

The Android process boundary is intentional. CoreCLR is initialized once in the game process and the process is terminated after the Activity is destroyed, preventing unsupported repeated runtime initialization in the same process.

## Repository Layout

```text
FnaAndroidCoreClrTemplate/
  app/
    src/main/java/...          Android Activity and bootstrap code
    src/main/assets/game/      generated sample output
    src/main/assets/runtime/   .NET runtime archive
    src/main/jniLibs/arm64-v8a/ optional prebuilt native assets
  native/
    src/dotnet/                hostfxr bridge
    src/sdl/                   SDL entry and Android bridge
    CMakeLists.txt
  third_party/
    FNA/                       pinned FNA managed source
    SDL/                       SDL native source
    FNA3D/                     FNA renderer source
    FAudio/                    audio source
    dotnethost/                hostfxr loading wrapper
  sample/
    FnaSample.csproj
    Program.cs
    Content/
  scripts/
    prepare-game.ps1
    fetch-runtime.ps1
  gradle/                      Gradle wrapper and version catalog
  docs/superpowers/specs/      approved design and implementation notes
```

FNA is consumed from a pinned source revision using its `FNA.NetStandard.csproj`; there is no assumption that a stable `FNA` NuGet package exists. Native dependencies follow the working integration pattern from `D:/RotatingartLauncher`, while launcher-only features are excluded.

## Build Flow

1. `dotnet publish sample/FnaSample.csproj -c Release` creates the `net10.0` assembly and its managed dependencies.
2. A Gradle `prepareGameAssets` task copies the publish output and a JSON manifest into `app/src/main/assets/game/`.
3. `assembleDebug` invokes the asset preparation task, builds the native arm64 libraries through CMake, and packages the runtime archive and game assets.
4. On first launch, the app extracts the runtime archive to an app-private directory and copies the game assets to a writable game directory.
5. The bootstrap sets `DOTNET_ROOT`, the working directory, `HOME`, `XDG_DATA_HOME`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, and `TMPDIR`.
6. The bootstrap loads required native libraries, calls the JNI hostfxr entry point, and passes the configured assembly path and command-line arguments.

The runtime archive is versioned with the template and must contain the expected `host/fxr/<version>/libhostfxr.so` and `shared/Microsoft.NETCore.App/<version>/libcoreclr.so` layout. The sample manifest records the assembly name, entry assembly, runtime version, and template format version.

## Sample Game

The sample is deliberately dependency-light. It creates a `Game`, initializes `GraphicsDeviceManager`, clears the screen, and draws a moving colored rectangle using a one-pixel `Texture2D`. This proves the CoreCLR, SDL, FNA3D, game loop, and graphics path without requiring a content pipeline or external art asset.

The sample project targets `net10.0` and references the pinned FNA managed project. Its output is a normal DLL that can be replaced by another FNA game output as long as the manifest and entry assembly are updated.

## Error Handling

Errors are reported with a stage and path:

- Asset extraction: missing archive, manifest, assembly, or runtime file.
- Native loading: library name and loader error.
- hostfxr: return code plus hostfxr error-writer output.
- Managed game: uncaught exception and process exit code.

Logcat uses a stable template tag. The Activity displays a short actionable summary while preserving the full diagnostic output in logcat. No external storage permission is required for the first version because game data is kept under app-private storage.

## Verification Plan

- Run `dotnet build sample/FnaSample.csproj -c Release` and verify the sample assembly exists.
- Run `dotnet publish sample/FnaSample.csproj -c Release` and verify the assets manifest and dependency files.
- Run `gradlew assembleDebug` and verify the APK contains the arm64 native libraries, runtime archive, and generated game assets.
- Install the APK on an arm64 Android 9+ device with `adb install`.
- Inspect `adb logcat` for runtime extraction, native loading, hostfxr initialization, and FNA startup.
- Verify the sample renders a frame, responds to Android touch/key input through SDL, and exits without leaving the app in a broken state.

## Out of Scope

- Multiple installed games or a file-picker launcher.
- Virtual control layout editing.
- Renderer switching and GL4ES/ANGLE selection UI.
- Mod patching, MonoMod, startup hooks, or per-game compatibility profiles.
- x86, x86_64, or armeabi-v7a APKs.
- Release signing and store publishing.

## Risks and Mitigations

- FNA managed source and native FNA3D versions must stay compatible. Pin both revisions and document the pairing.
- CoreCLR native library load order is significant. Keep the load sequence explicit and verify it on device.
- APK assets are read-only and compressed. Always execute the extracted copy from app-private storage.
- A build can succeed while runtime assets are incomplete. Keep manifest validation and APK content checks in the build/verification scripts.
