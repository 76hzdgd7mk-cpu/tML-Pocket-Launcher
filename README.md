# FNA CoreCLR Game Template

This repository is a single-game FNA template. The root is the C# game
project; Android is a platform backend under `platforms/android/`. The game
runs as a normal .NET 10 IL assembly hosted by CoreCLR and uses SDL2, FNA3D,
and FAudio for Android windowing, input, graphics, and audio.

## Layout

```text
FnaTemplate.csproj       root FNA game project
Program.cs               game entry point and minimal sample
Content/                 game content (add your own content here)
platforms/android/      Android host, JNI bridge, Gradle, and runtime assets
external/                pinned FNA, SDL, FNA3D, and FAudio submodules
THIRD_PARTY_NOTICES.md   dependency revisions and license notes
docs/                    design and implementation documents
```

The Android backend targets API 28+, `arm64-v8a`, .NET 10 CoreCLR, and OpenGL
ES 3 through FNA3D.

## Requirements

- .NET SDK 10.0.101 or a compatible .NET 10 SDK
- JDK 21
- Android SDK Platform 37
- Android NDK 30.0.14904198 rc1
- CMake 3.22.1
- Git and `adb`

## Checkout

Fresh checkout:

```powershell
git clone --recurse-submodules https://github.com/FireworkSky/FNA-ANDROID.git
cd FNA-ANDROID
```

Existing checkout:

```powershell
git submodule update --init --recursive
```

The build does not fetch dependencies automatically. It verifies that the
four submodules are initialized at the pinned commits before compiling.

## Build

Run these commands from the repository root:

```powershell
dotnet build FnaTemplate.csproj -c Release
Push-Location platforms/android
.\gradlew.bat clean :app:assembleDebug
Pop-Location
.\platforms\android\scripts\check-apk-assets.ps1 `
  -ApkPath platforms/android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk
```

The Gradle build publishes `FnaTemplate.csproj` and packages the resulting
assembly, dependencies, manifest, and CoreCLR runtime into the APK.

## Run On Android

```powershell
adb shell pm clear com.example.fnatemplate
adb install -r platforms/android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk
adb shell am start -n com.example.fnatemplate/.MainActivity
adb logcat -s FnaAndroidCoreClr SDL
```

Clear app data when testing a changed assembly so Android does not reuse an
older extracted game directory.

## Start A New Game

Replace the root managed project and game source files while keeping:

- target framework `net10.0`;
- runtime identifier `linux-arm64`;
- a reference to `external/FNA/FNA.NetStandard.csproj`;
- an executable managed entry assembly.

Update the assembly name in `platforms/android/scripts/prepare-game.ps1` and
`platforms/android/scripts/check-apk-assets.ps1` when renaming the root game
project. Android host code and CoreCLR startup do not need to be changed for a
normal FNA game.

## Third-Party Sources

Dependency revisions, upstream URLs, and license guidance are recorded in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). The `dotnethost` adapter is
template-owned code under `platforms/android/native/dotnethost`.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for verification and repository
hygiene rules.
