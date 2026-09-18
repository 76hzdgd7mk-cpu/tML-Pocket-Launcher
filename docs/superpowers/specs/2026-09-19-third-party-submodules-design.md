# Third-Party Submodules Design

## Status

Revised draft awaiting review. The implementation must preserve the existing
Android/CoreCLR build and runtime behavior while making the game project the
primary repository layout.

## Goal

Make the repository feel like an FNA game template rather than an Android
application template. The game project and content live at the repository
root, Android is one platform backend, and native and managed third-party
source revisions are reproducible through Git submodules.

## Submodule Layout

The following directories become Git submodules under `external/`:

| Path | Repository | Pinned revision |
| --- | --- | --- |
| `external/FNA` | `https://github.com/FNA-XNA/FNA.git` | `2f5d094a173e9423448d472d5735d13997985f13` |
| `external/SDL` | `https://github.com/RotatingArtDev/SDL.git` | `a11d64ff44fdeb22af604d7bc1c77e941bfd0d67` |
| `external/FNA3D` | `https://github.com/RotatingArtDev/FNA3D.git` | `2c2907aad90f66dba083ca3689343c1afcf7fb09` |
| `external/FAudio` | `https://github.com/RotatingArtDev/FAudio.git` | `c370ada0eedcab8d9c270b5c5fc2274f4e7f3ec6` |

The main repository records each submodule commit through a gitlink. The CMake
and C# project references are updated to the new `external/` paths.

## Repository Layout

The repository follows the FNA-Template model, with the game as the primary
project and Android as a platform backend:

```text
GameProject/
  GameProject.csproj
  Program.cs
  Game.cs
  Content/
  build/                         shared build helpers
  platforms/android/
    app/                         Android application module
    native/                      JNI, hostfxr bridge, and CMake entry point
    gradle/                      Gradle wrapper and version catalog
    scripts/                     Android asset preparation and validation
    runtime/                     CoreCLR runtime version metadata
  external/                      pinned Git submodules
    FNA/
    SDL/
    FNA3D/
    FAudio/
  docs/
```

The current `sample/` project is promoted into the root game project. The
generated game assets remain under
`platforms/android/app/src/main/assets/game/`.

## Locally Maintained Native Code

`platforms/android/native/dotnethost` is a template-specific hostfxr adapter
and is not treated as a drop-in upstream checkout. It remains inside the
Android platform directory as platform-owned native code. CMake include and
source paths must be updated accordingly without changing the native target or
JNI behavior.

The old `third_party/fna-unpacked` directory is not referenced by the build and
is removed.

## Build and Checkout Experience

- Add a root `.gitmodules` file with the four `external/` submodule definitions.
- Add a PowerShell validation script that reports uninitialized or empty
  submodules before build configuration starts.
- Make the Android Gradle build invoke that validation before compiling native
  code.
- Document fresh and existing checkout commands:
  `git clone --recurse-submodules` and
  `git submodule update --init --recursive`.
- Keep third-party license and revision information in the root
  `THIRD_PARTY_NOTICES.md`.

The validation must fail with an actionable message and must not attempt to
silently fetch or modify submodules. Fetching remains an explicit developer
operation.

## Compatibility Requirements

- The root game project continues to reference
  `external/FNA/FNA.NetStandard.csproj`.
- Native CMake continues to build SDL2, FAudio, FNA3D, and dotnethost for
  `arm64-v8a`.
- The .NET 10 CoreCLR runtime archive and generated game assets remain
  unchanged.
- The current Android manifest, package name, and application behavior remain
  unchanged in this phase.

## Verification

After migration, verify all of the following:

1. A checkout with initialized submodules passes the submodule validation.
2. `dotnet build GameProject.csproj -c Release` succeeds.
3. `platforms/android/gradlew clean :app:assembleDebug` succeeds.
4. The APK asset validation script succeeds.
5. The repository records only gitlinks for the four external source trees and
   no copied source files from those trees.
6. An arm64 Android device still starts the sample and renders through SDL2,
   FNA3D, FAudio, and CoreCLR.
