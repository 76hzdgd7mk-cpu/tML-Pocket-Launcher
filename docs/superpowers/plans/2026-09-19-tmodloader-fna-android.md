# tModLoader FNA Android Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build an isolated tModLoader-FNA-Android project that preserves desktop tModLoader builds, adds an explicit Android platform, downloads user-owned Terraria content through SteamKit2, and launches the net8.0 tModLoader assembly inside the .NET 10 CoreCLR Android host.

**Architecture:** Start a new Git worktree from the clean FNA Android CoreCLR template branch. Keep upstream tModLoader as a pinned submodule and generate a patched build tree from it; Android code lives in repository overlays applied only during source preparation. The Android Activity initializes CoreCLR once, invokes TmlAndroidBootstrap, performs Steam/content preparation, and invokes tModLoader in the same process.

**Tech Stack:** Kotlin/Gradle Android host, SDL2/FNA3D/FAudio, C++ JNI/hostfxr bridge, .NET 10 CoreCLR, tModLoader net8.0, SteamKit2 3.4.0, Android Keystore AES-GCM, PowerShell build scripts, and offline .NET tests.

---

## File map

- third_party/tModLoader/: pinned upstream submodule; never edit directly.
- patches/android/*.patch: ordered, reviewable upstream patches.
- platforms/android/: Android-only overlays and MSBuild metadata.
- src/android/TmlAndroidBootstrap/: Steam auth, content download, Android bridge, and managed tModLoader entrypoint.
- scripts/prepare-tmodloader-source.ps1: stages the submodule and applies patches.
- scripts/build-tmodloader.ps1: builds the staged tModLoader tree without Steam-directory installation.
- tests/TmlAndroidBootstrap.Tests/: deterministic tests for platform, storage, ownership, and download behavior.
- platforms/android/app/: existing FNA Android CoreCLR host.

## Task 1: Create the isolated project and pin source inputs

Files: .worktrees/tmodloader-fna-android, .gitmodules, .gitignore, Directory.Build.props, THIRD_PARTY_NOTICES.md, third_party/tModLoader/

- [ ] Step 1: Create the worktree

```
git worktree add '.worktrees/tmodloader-fna-android' -b 'feat/tmodloader-fna-android' 'feat/fna-android-coreclr'
```

Expected: a clean linked worktree containing the FNA Android template.

- [ ] Step 2: Add and pin tModLoader

```
git -C '.worktrees/tmodloader-fna-android' submodule add https://github.com/tModLoader/tModLoader.git third_party/tModLoader
git -C '.worktrees/tmodloader-fna-android/third_party/tModLoader' checkout d30c844159
git -C '.worktrees/tmodloader-fna-android' submodule update --init --recursive third_party/tModLoader
```

Verify src/tModLoader/Terraria/Terraria.csproj, src/TerrariaNetCore/ReLogic/OS/Platform.cs, and the nested FNA submodule exist. Record both revisions and licenses in THIRD_PARTY_NOTICES.md.

- [ ] Step 3: Add safe ignores and Android-only build properties

Add build/tmodloader-src/, build/tmodloader-output/, build/steam-content/, build/download-state/, local-content/, *.refresh-token, and *.steam-credentials.json to .gitignore. Create Directory.Build.props with only these defaults:

```
<Project>
  <PropertyGroup>
    <TmlAndroid Condition="'$(TmlAndroid)' == ''">false</TmlAndroid>
    <TmlAndroidOutputRoot Condition="'$(TmlAndroidOutputRoot)' == ''">$(MSBuildThisFileDirectory)build/tmodloader-output</TmlAndroidOutputRoot>
  </PropertyGroup>
</Project>
```

Do not globally change TargetFramework or desktop platform detection.

- [ ] Step 4: Commit the source input

```
git add .gitmodules .gitignore Directory.Build.props THIRD_PARTY_NOTICES.md third_party/tModLoader
git commit -m "build: pin tModLoader source for Android port"
```

## Task 2: Build from a patched generated tree

Files: scripts/prepare-tmodloader-source.ps1, scripts/build-tmodloader.ps1, patches/android/README.md, platforms/android/Directory.Build.targets, platforms/android/AndroidBuild.props, tests/source-preparation.Tests.ps1

- [ ] Step 1: Implement source preparation

Use strict PowerShell mode, resolve the root from PSScriptRoot, refuse a missing submodule, copy third_party/tModLoader to a clean build/tmodloader-src, apply patches in lexical order, overlay platforms/android/overlay, and write build/tmodloader-src/source-manifest.json. The patch loop must validate before applying:

```
$patches = Get-ChildItem (Join-Path $repoRoot 'patches/android') -Filter '*.patch' | Sort-Object Name
foreach ($patch in $patches) {
    git -C $stagedSource apply --check --whitespace=error $patch.FullName
    if ($LASTEXITCODE -ne 0) { throw "Patch validation failed: $($patch.Name)" }
    git -C $stagedSource apply --whitespace=error $patch.FullName
    if ($LASTEXITCODE -ne 0) { throw "Patch application failed: $($patch.Name)" }
}
```

The script must never write to the submodule and must delete only the explicit generated staging directory after verifying its path.

- [ ] Step 2: Add Android MSBuild isolation

Directory.Build.targets is imported only when TmlAndroid=true; it removes the desktop Steam-directory copy target, redirects output under TmlAndroidOutputRoot, and excludes Steamworks.NET, registry, RGB, updater, and desktop native assets. Normal desktop builds must not import it.

- [ ] Step 3: Implement the build wrapper

build-tmodloader.ps1 calls preparation and then builds src/tModLoader/Terraria/Terraria.csproj with Release, TmlAndroid=true, and TmlAndroidOutputRoot set to the repository output directory. It supports Configuration, Restore, and Clean switches, returns nonzero on failure, and asserts tModLoader.dll plus runtime configuration exist.

- [ ] Step 4: Test the source boundary

Test deterministic repeated preparation, successful patch application, malformed-patch failure before output completion, and an unchanged hash/status for third_party/tModLoader.

- [ ] Step 5: Commit

```
git add scripts patches/android platforms/android/Directory.Build.targets platforms/android/AndroidBuild.props tests
git commit -m "build: isolate Android tModLoader source patches"
```

## Task 3: Add explicit Android platform services

Files: patches/android/0001-platform-android.patch, platforms/android/overlay/src/TerrariaNetCore/ReLogic/OS/Android/, platforms/android/overlay/src/TerrariaNetCore/ReLogic/Localization/IME/AndroidIme.cs, src/android/TmlAndroidBootstrap/Android/AndroidBridge.cs, AndroidPathProvider.cs, AndroidEventQueue.cs, tests/TmlAndroidBootstrap.Tests/PlatformSelectionTests.cs

- [ ] Step 1: Add PlatformType.Android and select it before Linux

Patch both upstream platform copies where present. Selection must be equivalent to:

```
OperatingSystem.IsWindows() ? new WindowsPlatform() :
OperatingSystem.IsMacOS() ? new OsxPlatform() :
OperatingSystem.IsAndroid() ? new AndroidPlatform() :
new LinuxPlatform();
```

Add Platform.IsAndroid; test enum presence and injectable selector behavior without altering the host OS.

- [ ] Step 2: Implement Android path, clipboard, window, and IME adapters

Use app-private FilesDirectory and CacheDirectory from the bridge. OpenURL delegates to an Android intent, delete removes only app-private files, clipboard calls marshal to the UI thread, and AndroidIme derives from PlatformIme and receives text events from the event queue.

- [ ] Step 3: Add the bridge and bounded FIFO event queue

Use this managed boundary:

```
public interface IAndroidBridge
{
    string FilesDirectory { get; }
    string CacheDirectory { get; }
    void RunOnUiThread(Action action);
    bool OpenUrl(string url);
    string? GetClipboardText();
    void SetClipboardText(string text);
    void SetOrientation(bool landscape);
    void SetImeVisible(bool visible);
}
```

Queue lifecycle, text, key, touch, focus, and back events; test FIFO order, cancellation, and overflow policy.

- [ ] Step 4: Commit

```
git add patches/android platforms/android/overlay src/android/TmlAndroidBootstrap/Android tests/TmlAndroidBootstrap.Tests/PlatformSelectionTests.cs
git commit -m "feat: add explicit Android platform services"
```

## Task 4: Gate desktop integrations and add the Android social boundary

Files: patches/android/0002-desktop-boundaries.patch, platforms/android/overlay/src/TerrariaNetCore/Terraria/Android/AndroidPlatformSocialModule.cs, AndroidDesktopOperationGuard.cs, tests/TmlAndroidBootstrap.Tests/DesktopOperationGuardTests.cs

- [ ] Step 1: Exclude desktop Steamworks and shell operations

Android build items must exclude Steamworks.NET.AnyCPU and steam_api. Android source must not call SteamAPI.Init, RestartAppIfNecessary, steamcmd, registry APIs, Process.Start, or updater self-replacement. Desktop behavior remains unchanged when TmlAndroid=false.

- [ ] Step 2: Implement the Android social module

Delegate identity, ownership, Workshop downloads, and cloud paths to TmlAndroidBootstrap; unsupported desktop-client features return a visible unsupported result and stable log reason. Never report missing native Steam as successful initialization.

- [ ] Step 3: Route Android mod compilation through Roslyn

Add an Android CompileInProcessAsync path that supplies references from staged tModLoader/FNA/runtime assemblies, calls CSharpCompilation.Emit, writes to a temporary DLL, validates it, and atomically promotes it. The existing external SDK path is desktop-only. Test that compilation succeeds with a tiny source and does not call Process.Start.

- [ ] Step 4: Gate URL, folder, registry, updater, and dialog callsites

Each Android branch must use the bridge or a structured unsupported result. Keep callsite changes in the separate patch so they can be reviewed against upstream.

- [ ] Step 5: Commit

```
git add patches/android platforms/android/overlay tests/TmlAndroidBootstrap.Tests
git commit -m "feat: gate desktop integrations on Android"
```

## Task 5: Implement CoreCLR bootstrap, Steam auth, and legal content download

Files: src/android/TmlAndroidBootstrap/TmlAndroidBootstrap.csproj, Program.cs, Android/AndroidKeystore.cs, Steam/SteamAuthService.cs, SteamConnection.cs, SteamOwnershipService.cs, SteamCredentialStore.cs, SteamDownloadState.cs, SteamDepotDownloader.cs, Runtime/TmlLoaderEntrypoint.cs, corresponding tests, and the existing Kotlin runtime bridge.

- [ ] Step 1: Define interfaces and stage errors

Define BootstrapStage values Authentication, Ownership, Manifest, Download, Validation, Runtime, Game, and ModCompilation. Abstract Steam client, auth-code provider, ownership, depot metadata, CDN transfer, and Android bridge so tests remain offline.

- [ ] Step 2: Implement Keystore-backed credentials

Persist only account name, refresh token, and GuardData in a versioned AES-GCM envelope. Password is method-local and never serialized. Key invalidation causes clean re-login; clear removes ciphertext and key alias. Tests assert token material is absent from plaintext files.

- [ ] Step 3: Implement Steam login and ownership gate

Adapt the proven SteamKit2 WebSocket flow from D:/StS2-Launcher-main, including email/mobile Steam Guard callbacks. Query PICS access tokens for Terraria 105600 before any depot request; optionally validate tModLoader 1281930. No ownership means no content download.

- [ ] Step 4: Implement resumable CDN download

Use depot keys, manifest request codes, SteamKit2.CDN.Client, bounded concurrency, cancellation, retries, chunk/file SHA-1 validation, .downloading files, and atomic state/manifest writes. Tests use fake depot clients for resume, retry, cancellation, corruption, and promotion.

- [ ] Step 5: Implement one-process launch

TmlLoaderEntrypoint sets DOTNET_ROOT, XDG paths, working directory, and content arguments, then loads and invokes tModLoader.dll in the current CoreCLR. An interlocked guard rejects a second launch; no dotnet process or second CoreCLR initialization is allowed.

- [ ] Step 6: Connect Kotlin/JNI to the managed bootstrap

Pass app-private paths and Activity callbacks through the existing JNI host. Surface progress and stage errors without logging passwords, tokens, tickets, cookies, or CDN credentials.

- [ ] Step 7: Commit

```
git add src/android/TmlAndroidBootstrap platforms/android/app/src/main/java tests/TmlAndroidBootstrap.Tests
git commit -m "feat: add Android Steam and CoreCLR bootstrap"
```

## Task 6: Package managed output into the Android APK

Files: scripts/prepare-tmodloader-assets.ps1, platforms/android/app/build.gradle.kts, platforms/android/app/src/main/AndroidManifest.xml, platforms/android/app/src/main/java/com/example/fnatemplate/runtime/AssetBootstrap.kt, generated platforms/android/app/src/main/assets/game/manifest.json

- [ ] Step 1: Stage managed output and manifest

Call build-tmodloader.ps1, copy managed output to build/tmodloader-output, write a manifest containing tModLoaderRevision, runtimeVersion, assembly, abi, and formatVersion, and reject paths containing Terraria content. Never copy local-content.

- [ ] Step 2: Make Gradle depend on preparation

Register prepareTmlAssets, make preBuild depend on it, use PowerShell -NoProfile -File, fail on nonzero exit, clear only generated asset paths, and copy bootstrap assemblies/manifest to APK assets.

- [ ] Step 3: Update runtime extraction and launcher state

Validate the manifest and staged tModLoader assembly. Downloaded Terraria content is resolved later into app-private storage after Steam ownership verification. Keep the game Activity in the dedicated game process.

- [ ] Step 4: Build and inspect

```
./platforms/android/gradlew -p platforms/android :app:assembleDebug
./platforms/android/scripts/check-apk-assets.ps1 -ApkPath platforms/android/app/build/outputs/apk/debug/app-debug.apk
```

Expected: arm64 native libraries, CoreCLR runtime, bootstrap assemblies, and non-commercial manifest exist; Terraria content does not.

- [ ] Step 5: Commit

```
git add platforms/android scripts/prepare-tmodloader-assets.ps1
git commit -m "build: package tModLoader for Android CoreCLR"
```

## Task 7: Tests, documentation, and device verification

Files: tests/TmlAndroidBootstrap.Tests/TmlAndroidBootstrap.Tests.csproj, README.md, docs/android-port.md, docs/steam-content.md, docs/troubleshooting.md, task_plan.md, findings.md, progress.md

- [ ] Step 1: Run deterministic host tests

Cover platform selection, Android paths, event FIFO, credential clear, Steam Guard, ownership denial, manifest parsing, retry/cancellation, hash validation, atomic promotion, one-time launch, in-process compilation, and desktop guards. No real account or commercial content is used.

- [ ] Step 2: Run desktop regression builds

Build the staged source with TmlAndroid=false and verify Windows/Linux/macOS references and selection remain available. Run tests and git diff --check.

- [ ] Step 3: Document legal and operational constraints

Document ownership requirements, no redistribution of Terraria content, password handling, encrypted refresh/GuardData, credential clearing, app-private content paths, build prerequisites, and exact APK commands.

- [ ] Step 4: Run final host/APK checks

```
dotnet test tests/TmlAndroidBootstrap.Tests/TmlAndroidBootstrap.Tests.csproj -c Release
powershell -NoProfile -File scripts/build-tmodloader.ps1 -Configuration Release
powershell -NoProfile -File scripts/prepare-tmodloader-assets.ps1
./platforms/android/gradlew -p platforms/android clean :app:assembleDebug
./platforms/android/scripts/check-apk-assets.ps1 -ApkPath platforms/android/app/build/outputs/apk/debug/app-debug.apk
git diff --check
git status --short
```

- [ ] Step 5: Verify device behavior

On an arm64 Android API 28+ device, install the APK, capture adb logcat -s FnaTemplate TmlAndroid, complete Steam Guard, verify ownership, interrupt/resume download, and confirm same-process tModLoader startup, rendering, touch/key/text/back input, IME, clipboard, and mod compilation. Record device/API/ABI/APK hash and exact residual limitations; do not claim device success without fresh logs.

- [ ] Step 6: Commit verification

```
git add README.md docs tests task_plan.md findings.md progress.md
git commit -m "test: document tModLoader Android verification"
```

