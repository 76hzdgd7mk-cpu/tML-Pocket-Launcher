# tModLoader Mobile Download and Launch UI Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace the generic startup mask with a full-screen download/install center and a Ready/Launching game surface for tModLoader Mobile.

**Architecture:** Keep SteamKit2, content verification, and CoreCLR launch in TmlAndroidHost. Add a typed launcher state/action boundary to IAndroidBridge, route status updates through a Kotlin state reducer, and render two focused Android View overlays. The content preparation task waits for an explicit launch action after Ready and can pause, resume, retry, or cancel through the same bridge action queue.

**Tech Stack:** Kotlin Android Views, SDLActivity/FNA, JNI C++ bridge, .NET 10 CoreCLR, SteamKit2, existing Android event queue.

---

### Task 1: Define typed launcher state and action contracts

**Files:**
- Create: platforms/android/app/src/main/java/com/example/fnatemplate/LauncherUiState.kt
- Create: src/android/TmlAndroidBootstrap/Android/AndroidLauncherAction.cs
- Modify: src/android/TmlAndroidBootstrap/Android/AndroidInputEvent.cs
- Modify: src/android/TmlAndroidBootstrap/Android/IAndroidBridge.cs

- [ ] Step 1: Add the Kotlin presentation state model.
  Define LauncherUiState as a sealed interface with Downloading(title, detail, progressPercent, indeterminate, downloadedBytes, totalBytes, speed, currentFile), Installing(title, detail), Paused(title, detail), Ready(version, detail), Launching(title, detail, progressPercent), and Failed(title, detail).
  Define LauncherAction with Pause, Resume, Retry, Cancel, Launch, and Recheck.
  Add parseLauncherState(title, detail, progressPercent). It classifies failed titles as Failed, paused titles as Paused, ready titles as Ready, downloading titles as Downloading, content/install titles as Installing, starting titles as Launching, and all other messages as Installing. Preserve -1 as indeterminate. Split the existing double-space download detail into byte/file fields only when those fields exist; never fabricate values.

- [ ] Step 2: Add the C# action contract.
  Create AndroidLauncherAction with Pause, Resume, Retry, Cancel, Launch, and Recheck. Add LauncherAction to AndroidInputEventKind.
  Add ValueTask<AndroidLauncherAction> WaitForLauncherActionAsync(CancellationToken cancellationToken = default) to IAndroidBridge. JniAndroidBridge implements it; NullAndroidBridge returns Cancel so desktop tests cannot block.

- [ ] Step 3: Build the bootstrap project.
  Run: dotnet build src/android/TmlAndroidBootstrap/TmlAndroidBootstrap.csproj
  Expected: build succeeds with no errors.
  Commit: git add platforms/android/app/src/main/java/com/example/fnatemplate/LauncherUiState.kt src/android/TmlAndroidBootstrap/Android; git commit -m "feat: add typed mobile launcher state contracts"

### Task 2: Transport launcher actions through JNI

**Files:**
- Modify: platforms/android/app/src/main/java/com/example/fnatemplate/runtime/AndroidBridge.kt
- Modify: platforms/android/native/include/android_bridge.hpp
- Modify: platforms/android/native/src/android_bridge.cpp
- Modify: src/android/TmlAndroidBootstrap/Android/JniAndroidBridge.cs
- Modify: src/android/TmlAndroidBootstrap/Android/NullAndroidBridge.cs

- [ ] Step 1: Add a dedicated Android launcher action event.
  Add EVENT_LAUNCHER_ACTION = 7 and postLauncherAction(action: Int) in AndroidBridge.kt. Reuse the existing native event action field; do not transport text for launcher actions.
  In JniAndroidBridge, map the event kind to an action Channel with capacity 8. Preserve lifecycle, text, key, touch, focus, back, and permission events in AndroidEventQueue.

- [ ] Step 2: Implement action waiting.
  WaitForLauncherActionAsync repeatedly calls PumpEvents, returns the next queued action, and delays 50ms with the caller cancellation token when no action exists. Invalid action integers are ignored after a short diagnostic log containing only the integer.

- [ ] Step 3: Test the bridge mapping.
  Add a pure mapping test to tests/TmlAndroidContent.Tests that verifies all six action values round-trip and invalid values are ignored.
  Run: dotnet test tests/TmlAndroidContent.Tests/TmlAndroidContent.Tests.csproj
  Expected: all tests pass.
  Commit: git add platforms/android/app/src/main/java/com/example/fnatemplate/runtime platforms/android/native src/android/TmlAndroidBootstrap tests/TmlAndroidContent.Tests; git commit -m "feat: transport launcher actions through Android bridge"

### Task 3: Build the download/install overlay

**Files:**
- Create: platforms/android/app/src/main/java/com/example/fnatemplate/DownloadInstallOverlay.kt
- Modify: platforms/android/app/src/main/java/com/example/fnatemplate/GameActivity.kt

- [ ] Step 1: Create the landscape-first layout.
  Implement a full-screen FrameLayout with a left tModLoader identity rail using R.drawable.tmodloader_icon and a right status workspace. Show phase title, detail, determinate or indeterminate progress, downloaded/total bytes, current file, storage summary, a five-step stage indicator, and Pause, Resume, Retry, and Cancel controls.
  Every control is at least 48dp high, has a content description, and has no EditText or focus request. Expose render(state), show(), hide(), and setActionHandler(handler).

- [ ] Step 2: Gate controls by state.
  Enable Pause only during active Downloading or Installing, Resume only for Paused, Retry only for Failed, and Cancel only while preparation is active. Hide byte/file rows when the parser has no real values.

- [ ] Step 3: Route actions.
  GameActivity maps LauncherAction.ordinal to AndroidBridge.postLauncherAction and reapplies immersive mode. Cancel returns an action to CoreCLR instead of finishing the Activity.

- [ ] Step 4: Compile.
  Run from platforms/android: ./gradlew.bat :app:compileDebugKotlin --no-daemon
  Expected: Kotlin compilation succeeds.
  Commit: git add platforms/android/app/src/main/java/com/example/fnatemplate/DownloadInstallOverlay.kt platforms/android/app/src/main/java/com/example/fnatemplate/GameActivity.kt; git commit -m "feat: add download and install center"

### Task 4: Build the game launch overlay

**Files:**
- Create: platforms/android/app/src/main/java/com/example/fnatemplate/GameLaunchOverlay.kt
- Modify: platforms/android/app/src/main/java/com/example/fnatemplate/GameActivity.kt

- [ ] Step 1: Implement Ready and Launching.
  Use the approved B layout: large tModLoader artwork on the left and a right library panel with BuildConfig.VERSION_NAME, Steam connection, content verification, storage usage, and one primary Launch tModLoader action. Keep the action at least 48dp high and add a content description.
  Expose showReady(version, detail, onLaunch), showLaunching(title, detail, progressPercent), showFailure(title, detail, onRetry), and hide().

- [ ] Step 2: Keep Launching visible.
  Do not hide the overlay when the host reports Starting tModLoader. Render Launching until SDL/FNA takes over or a failure is reported. Failure shows a sanitized detail and retry action.

- [ ] Step 3: Compile and commit.
  Run from platforms/android: ./gradlew.bat :app:compileDebugKotlin --no-daemon
  Expected: build succeeds.
  Commit: git add platforms/android/app/src/main/java/com/example/fnatemplate/GameLaunchOverlay.kt platforms/android/app/src/main/java/com/example/fnatemplate/GameActivity.kt; git commit -m "feat: add tModLoader game launch surface"

### Task 5: Connect host lifecycle to Ready and Launching

**Files:**
- Modify: src/android/TmlAndroidHost/Program.cs
- Modify: src/android/TmlAndroidHost/SteamContentPreparation.cs
- Modify: src/android/TmlAndroidBootstrap/Android/IAndroidBridge.cs
- Modify: src/android/TmlAndroidBootstrap/Android/NullAndroidBridge.cs

- [ ] Step 1: Add the Ready action loop.
  After EnsureTerrariaContentAsync succeeds, publish title Ready, detail Terraria content is installed and verified., and progress 100. Wait for Launch, Recheck, or Cancel. Launch continues into LaunchManagedGame; Recheck validates content and republishes Ready; Cancel throws a user-facing cancellation exception without deleting valid content.

- [ ] Step 2: Add resumable preparation control.
  Pass a linked CancellationTokenSource into SteamContentPreparation. Pause cancels the current transfer and preserves the download directory. Resume restarts preparation against that directory. Retry clears only the failed temporary file and retries preparation. Verified files and credential storage are never cleared.

- [ ] Step 3: Preserve desktop behavior.
  Enter the action loop only inside the OperatingSystem.IsAndroid branch. NullAndroidBridge returns Launch for non-Android host tests.

- [ ] Step 4: Build and test.
  Run: dotnet test tests/TmlAndroidContent.Tests/TmlAndroidContent.Tests.csproj
  Run: dotnet build src/android/TmlAndroidHost/TmlAndroidHost.csproj -c Release
  Expected: tests pass and the host builds for net10.0/linux-arm64.
  Commit: git add src/android/TmlAndroidHost src/android/TmlAndroidBootstrap; git commit -m "feat: connect content preparation to launcher states"

### Task 6: Replace the generic startup overlay and verify the device flow

**Files:**
- Modify: platforms/android/app/src/main/java/com/example/fnatemplate/GameActivity.kt
- Modify: platforms/android/app/src/main/java/com/example/fnatemplate/runtime/AndroidBridge.kt
- Modify: src/android/TmlAndroidHost/Program.cs

- [ ] Step 1: Use one main-thread state reducer.
  updateStartupStatus parses the incoming title/detail/progress, then routes Ready to GameLaunchOverlay, Launching to the launch surface, Failed to the retry surface, and all other states to DownloadInstallOverlay. Unknown titles remain visible in the download/install surface. Ignore updates after the Activity is finishing or destroyed.

- [ ] Step 2: Keep Steam login isolated.
  Do not merge SteamLoginOverlay into either new overlay. Hide the download overlay while a login prompt is attached and show it again after the prompt is dismissed. Existing account, password, and Guard callbacks remain on the existing event queue.

- [ ] Step 3: Build, install, and launch.
  Run from platforms/android: ./gradlew.bat :app:assembleDebug --no-daemon
  Install app/build/outputs/apk/debug/app-arm64-v8a-debug.apk with adb install -r, force-stop com.example.fnatemplate, then start com.example.fnatemplate/.MainActivity.
  Expected: BUILD SUCCESSFUL, installation succeeds, and the app opens landscape without system bars or automatic IME.

- [ ] Step 4: Verify states and layout.
  Capture Checking/Authenticating, determinate Downloading, Installing, Ready, Launching, and Failed screenshots. Verify root bounds 2400x1080, no side gutters, no clipped text, and 48dp controls.
  Run: adb shell dumpsys input_method | Select-String 'mInputShown|mServedView'
  Run: adb shell dumpsys window windows | Select-String 'GameActivity|vsysui|mBounds=Rect'
  Run: git diff --check
  Expected: mInputShown=false, GameActivity reports FULLSCREEN HIDE_NAVIGATION IMMERSIVE_STICKY, bounds are 0,0 - 2400,1080, and diff check is clean.
  Commit: git add platforms/android src/android tests; git commit -m "feat: add mobile download and game launch flow"

## Self-review

- Spec direction A is implemented by DownloadInstallOverlay; direction B by GameLaunchOverlay.
- Existing SetStartupStatus remains compatible and feeds a typed Kotlin reducer.
- Credentials remain in prompt and keystore paths; no UI state contains credential values.
- Action transport is typed and separate from key/touch events.
- Android-only Ready waiting preserves desktop behavior through NullAndroidBridge.
- Device checks cover IME, immersive bounds, clipping, status visibility, and all required states.
- No TBD, TODO, FIXME, or placeholder steps are present.
