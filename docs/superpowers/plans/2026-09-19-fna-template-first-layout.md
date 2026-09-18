# FNA Template-First Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the repository around a root FNA game project, move Android into `platforms/android/`, and replace copied third-party sources with pinned Git submodules without changing runtime behavior.

**Architecture:** The root is the managed FNA game template (`FnaTemplate.csproj`, source, and content). Android is a platform backend containing the Gradle app, JNI/CoreCLR native host, runtime assets, and Android-specific scripts. External FNA, SDL, FNA3D, and FAudio sources are checked out under `external/` as gitlinks; the template-owned dotnethost adapter stays under `platforms/android/native/`.

**Tech Stack:** .NET 10, FNA `FNA.NetStandard`, Android Gradle Plugin/Kotlin, CMake, SDL2, FNA3D, FAudio, .NET CoreCLR/hostfxr, Git submodules, PowerShell.

---

### Task 1: Freeze the migration inputs

**Files:**
- Read: `docs/superpowers/specs/2026-09-19-third-party-submodules-design.md`
- Read: `third_party/THIRD_PARTY_NOTICES.md`
- Read: `app/build.gradle.kts`, `native/CMakeLists.txt`, `scripts/prepare-game.ps1`

- [x] **Step 1: Confirm the worktree is clean except the plan/spec commits**

Run:

```powershell
git status --short
git log -3 --oneline --decorate
```

Expected: no uncommitted source changes before the migration starts.

- [x] **Step 2: Confirm each required remote revision exists**

Run:

```powershell
git ls-remote https://github.com/FNA-XNA/FNA.git 45df1c8db64a92ec538cc9a8f64522044867d793
git ls-remote https://github.com/RotatingArtDev/SDL.git a11d64ff44fdeb22af604d7bc1c77e941bfd0d67
git ls-remote https://github.com/RotatingArtDev/FNA3D.git 2c2907aad90f66dba083ca3689343c1afcf7fb09
git ls-remote https://github.com/RotatingArtDev/FAudio.git c370ada0eedcab8d9c270b5c5fc2274f4e7f3ec6
```

Expected: each command prints the requested commit hash.

### Task 2: Promote the managed sample into the root FNA template

**Files:**
- Move: `sample/FnaSample.csproj` -> `FnaTemplate.csproj`
- Move: `sample/Program.cs` -> `Program.cs`
- Modify: `FnaTemplate.csproj`
- Modify: `Program.cs`
- Delete: `sample/README.md`

- [x] **Step 1: Move the game files and rename the managed identity**

Use `Move-Item` for the file moves, then update the project properties to:

```xml
<AssemblyName>FnaTemplate</AssemblyName>
<RootNamespace>FnaTemplate</RootNamespace>
<ProjectReference Include="external\FNA\FNA.NetStandard.csproj" />
```

Keep `TargetFramework` as `net10.0`, `RuntimeIdentifier` as `linux-arm64`, and `SelfContained` as `false`.

- [x] **Step 2: Rename the sample game type and namespace**

Change `namespace FnaSample;` to `namespace FnaTemplate;`, `SampleGame` to `FnaTemplateGame`, and the window title to `FNA Template`. Keep the existing minimal moving-rectangle behavior unchanged.

- [x] **Step 3: Confirm the root project compiles before moving Android**

Run:

```powershell
dotnet build FnaTemplate.csproj -c Release
```

Expected: the project resolves `external/FNA` once the submodule migration is complete and produces `FnaTemplate.dll`.

### Task 3: Move Android into the platform backend

**Files:**
- Move: `app/` -> `platforms/android/app/`
- Move: `native/` -> `platforms/android/native/`
- Move: `gradle/` -> `platforms/android/gradle/`
- Move: `gradlew`, `gradlew.bat`, `build.gradle.kts`, `settings.gradle.kts`, `gradle.properties` -> `platforms/android/`
- Move: `runtime/` -> `platforms/android/runtime/`
- Move: `scripts/` -> `platforms/android/scripts/`

- [x] **Step 1: Create the platform directory and move tracked Android files**

Use `Move-Item` to preserve file contents and directory history where possible. Do not move generated root `.gradle/`, `.kotlin/`, or `build/` directories.

- [x] **Step 2: Update the Android Gradle task paths**

In `platforms/android/app/build.gradle.kts`, keep `workingDir(rootDir)` and invoke the now-local script:

```kotlin
val verifyExternalSources by tasks.registering(Exec::class) {
    workingDir(rootDir)
    commandLine("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/verify-submodules.ps1")
}

val prepareGameAssets by tasks.registering(Exec::class) {
    dependsOn(verifyExternalSources)
    workingDir(rootDir)
    commandLine("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/prepare-game.ps1")
}
```

Keep `preBuild.dependsOn(prepareGameAssets)` and all existing Android plugin, ABI, SDK, and native build settings.

- [x] **Step 3: Make Android settings resolve from its new root**

Set the Android settings project name to `FnaTemplateAndroidHost`; keep `include(":app")`. The existing `../native/CMakeLists.txt` path remains correct from `platforms/android/app`.

### Task 4: Convert external source trees to pinned Git submodules

**Files:**
- Create: `.gitmodules`
- Create: `external/FNA` gitlink
- Create: `external/SDL` gitlink
- Create: `external/FNA3D` gitlink
- Create: `external/FAudio` gitlink
- Move: `third_party/dotnethost` -> `platforms/android/native/dotnethost`
- Move: `third_party/THIRD_PARTY_NOTICES.md` -> `THIRD_PARTY_NOTICES.md`
- Delete: `third_party/fna-unpacked/`
- Delete: copied source trees under `third_party/FNA`, `third_party/SDL`, `third_party/FNA3D`, and `third_party/FAudio`

- [x] **Step 1: Preserve template-owned native code and notices**

Move `third_party/dotnethost` and the notices file before removing the copied external trees. Remove `third_party/fna-unpacked` only after `rg` confirms it is not referenced by tracked build files.

- [x] **Step 2: Add each submodule at the pinned commit**

Run:

```powershell
git submodule add https://github.com/FNA-XNA/FNA.git external/FNA
git -C external/FNA checkout 45df1c8db64a92ec538cc9a8f64522044867d793
git submodule add https://github.com/RotatingArtDev/SDL.git external/SDL
git -C external/SDL checkout a11d64ff44fdeb22af604d7bc1c77e941bfd0d67
git submodule add https://github.com/RotatingArtDev/FNA3D.git external/FNA3D
git -C external/FNA3D checkout 2c2907aad90f66dba083ca3689343c1afcf7fb09
git submodule add https://github.com/RotatingArtDev/FAudio.git external/FAudio
git -C external/FAudio checkout c370ada0eedcab8d9c270b5c5fc2274f4e7f3ec6
```

Expected: `.gitmodules` contains four `external/*` entries and `git submodule status` shows the four exact hashes.

- [x] **Step 3: Update the root license/revision notice**

Keep the existing revision hashes, replace `third_party` paths with `external`, and document that `dotnethost` is platform-owned code under `platforms/android/native/dotnethost`.

### Task 5: Update native and managed build paths

**Files:**
- Modify: `FnaTemplate.csproj`
- Modify: `platforms/android/native/CMakeLists.txt`
- Modify: `platforms/android/native/cmake/SdlOptions.cmake`
- Modify: `platforms/android/native/cmake/Fna3dOptions.cmake`
- Modify: `platforms/android/native/cmake/FaudioOptions.cmake`

- [x] **Step 1: Point CMake at the root external directory**

In `platforms/android/native/CMakeLists.txt`, set:

```cmake
set(LIBS_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../external")
```

Replace the dotnethost subdirectory and include path with the platform-owned directory:

```cmake
set(DOTNETHOST_DIR "${CMAKE_CURRENT_SOURCE_DIR}/dotnethost")
add_subdirectory("${DOTNETHOST_DIR}" "${CMAKE_BINARY_DIR}/dotnethost")
```

Use `${DOTNETHOST_DIR}/include` in `target_include_directories`; keep `${LIBS_DIR}/SDL`, `${LIBS_DIR}/FNA3D`, and `${LIBS_DIR}/FAudio` unchanged in the option files.

- [x] **Step 2: Update generated CMake output directories**

Change only the binary output labels from `third_party/...` to `external/...` in the three option files if needed. These are CMake build directories, not source paths; source paths must remain `${LIBS_DIR}/SDL`, `${LIBS_DIR}/FNA3D`, and `${LIBS_DIR}/FAudio`.

- [x] **Step 3: Check for stale old paths**

Run:

```powershell
rg -n "third_party/(FNA|SDL|FNA3D|FAudio|dotnethost)|sample/FnaSample|FnaSample\.dll|(^|/)app/|(^|/)native/" --glob '!external/**' --glob '!**/bin/**' --glob '!**/obj/**' --glob '!**/.cxx/**' .
```

Expected: no active build script or source file contains an old path; historical design documents may be updated separately or explicitly marked as historical.

### Task 6: Update asset preparation and repository documentation

**Files:**
- Modify: `platforms/android/scripts/prepare-game.ps1`
- Modify: `platforms/android/scripts/check-apk-assets.ps1`
- Modify: `platforms/android/scripts/fetch-runtime.ps1`
- Create: `platforms/android/scripts/verify-submodules.ps1`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `.gitignore`

- [x] **Step 1: Make scripts resolve the repository root explicitly**

For scripts under `platforms/android/scripts`, use:

```powershell
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$androidRoot = Join-Path $repoRoot 'platforms/android'
```

`prepare-game.ps1` must publish `FnaTemplate.csproj`, copy from `bin/Release/net10.0/linux-arm64/publish`, write `FnaTemplate.dll` into `platforms/android/app/src/main/assets/game`, and write the matching manifest assembly name.

- [x] **Step 2: Add non-mutating submodule validation**

`verify-submodules.ps1` must check each expected path exists, contains a Git checkout, and has the exact pinned `HEAD`; it must throw an actionable error telling the developer to run `git submodule update --init --recursive`. It must not fetch or change any repository state.

- [x] **Step 3: Update APK validation and ignore rules**

Change the required APK entry from `assets/game/FnaSample.dll` to `assets/game/FnaTemplate.dll`. Ignore generated paths under `platforms/android/app/build`, `platforms/android/app/src/main/assets/game`, `platforms/android/.cxx`, `bin/`, and `obj/`; stop using the old `sample/bin`, `sample/obj`, and root `app/build` entries.

- [x] **Step 4: Rewrite the README and contribution guide around the template workflow**

Document the root game project, `platforms/android` backend, `external` submodules, fresh checkout with `--recurse-submodules`, existing checkout initialization, build commands, APK validation, arm64 device requirements, and the rule that game code is replaced at the root rather than under `sample/`.

### Task 7: Validate the migrated template

**Files:**
- Test: `FnaTemplate.csproj`
- Test: `platforms/android/scripts/verify-submodules.ps1`
- Test: `platforms/android/scripts/check-apk-assets.ps1`
- Test: Android arm64 APK on device `703a7b4e`

- [x] **Step 1: Verify submodule state and managed build**

Run:

```powershell
git submodule status
dotnet build FnaTemplate.csproj -c Release
```

Expected: four exact pinned submodule hashes and zero C# build errors.

- [x] **Step 2: Build and inspect the APK**

Run:

```powershell
Push-Location platforms/android
.\gradlew.bat clean :app:assembleDebug
Pop-Location
.\platforms\android\scripts\check-apk-assets.ps1 -ApkPath platforms/android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk
```

Expected: `BUILD SUCCESSFUL`; APK contains `libmain.so`, `libSDL2.so`, the CoreCLR archive, `manifest.json`, and `FnaTemplate.dll`.

- [ ] **Step 3: Re-run the existing device smoke workflow**

Install and launch the APK after clearing the old app data so no previous `FnaSample.dll` can be loaded:

```powershell
adb shell pm clear com.example.fnatemplate
adb install -r platforms/android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk
adb shell am start -n com.example.fnatemplate/.MainActivity
adb logcat -s FnaAndroidCoreClr SDL
```

Expected: CoreCLR initializes, FNA creates the SDL/FNA3D window, and the sample renders on the arm64 device.

- [x] **Step 4: Confirm repository hygiene**

Run:

```powershell
git diff --check
git status --short
git submodule status
```

Expected: no generated artifacts are tracked, no stale copied dependency trees remain, and only intentional migration files are modified.

### Task 8: Commit the migration

- [ ] **Step 1: Commit in focused changes**

Use Conventional Commit messages for the migration, for example:

```text
refactor: organize repository as FNA game template
build: pin native dependencies as git submodules
docs: document template-first Android workflow
```

- [ ] **Step 2: Record final verification output**

Include the successful managed build, Android build, APK asset check, submodule hashes, and device launch result in the final handoff.
