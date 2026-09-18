# Third-Party Submodules Design

## Status

Approved direction for implementation. The implementation must preserve the
existing Android/CoreCLR build and runtime behavior.

## Goal

Reduce the main repository size and make native and managed third-party source
revisions reproducible by converting vendored libraries into Git submodules.

## Submodule Layout

The following directories become Git submodules:

| Path | Repository | Pinned revision |
| --- | --- | --- |
| `third_party/FNA` | `https://github.com/FNA-XNA/FNA.git` | `2f5d094a173e9423448d472d5735d13997985f13` |
| `third_party/SDL` | `https://github.com/RotatingArtDev/SDL.git` | `a11d64ff44fdeb22af604d7bc1c77e941bfd0d67` |
| `third_party/FNA3D` | `https://github.com/RotatingArtDev/FNA3D.git` | `2c2907aad90f66dba083ca3689343c1afcf7fb09` |
| `third_party/FAudio` | `https://github.com/RotatingArtDev/FAudio.git` | `c370ada0eedcab8d9c270b5c5fc2274f4e7f3ec6` |

The main repository records each submodule commit through a gitlink. The
existing FNA, SDL, FNA3D, and FAudio paths remain unchanged so the current
Gradle, CMake, and C# project references continue to work.

## Locally Maintained Native Code

`third_party/dotnethost` is a template-specific hostfxr adapter and is not
treated as a drop-in upstream checkout. It moves to `native/hostfxr` so the
`third_party` directory contains only external source dependencies. CMake
include and source paths must be updated accordingly without changing the
native target or JNI behavior.

`third_party/fna-unpacked` is not referenced by the build and is removed.

## Build and Checkout Experience

- Add a root `.gitmodules` file with the four submodule definitions.
- Add a PowerShell validation script that reports uninitialized or empty
  submodules before build configuration starts.
- Make the Gradle build invoke that validation before compiling native code.
- Document fresh and existing checkout commands:
  `git clone --recurse-submodules` and
  `git submodule update --init --recursive`.
- Keep third-party license and revision information in
  `third_party/THIRD_PARTY_NOTICES.md`.

The validation must fail with an actionable message and must not attempt to
silently fetch or modify submodules. Fetching remains an explicit developer
operation.

## Compatibility Requirements

- `sample/FnaSample.csproj` continues to reference
  `third_party/FNA/FNA.NetStandard.csproj`.
- Native CMake continues to build SDL2, FAudio, FNA3D, and dotnethost for
  `arm64-v8a`.
- The .NET 10 CoreCLR runtime archive and generated game assets remain
  unchanged.
- The current Android manifest, package name, and application behavior remain
  unchanged in this phase.

## Verification

After migration, verify all of the following:

1. A checkout with initialized submodules passes the submodule validation.
2. `dotnet build sample/FnaSample.csproj -c Release` succeeds.
3. `gradlew clean :app:assembleDebug` succeeds.
4. The APK asset validation script succeeds.
5. The repository records only gitlinks for the four external source trees and
   no copied source files from those trees.
6. An arm64 Android device still starts the sample and renders through SDL2,
   FNA3D, FAudio, and CoreCLR.
