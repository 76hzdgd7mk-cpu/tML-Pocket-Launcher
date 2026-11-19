# Renderer APK Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the launcher discover separately installed renderer APK plugins, expose compatible choices, stage and verify their native libraries, and select them in the SDL2/FNA3D game process.

**Architecture:** Define a versioned APK manifest/action contract and keep parsing, compatibility checks, package discovery, and private library staging inside `feature/renderers`. The launcher controller publishes a cached renderer catalog and validates preferences; `GameRuntime` revalidates and stages the selected plugin before setting `FNA3D_OPENGL_DRIVER` and `RALCORE_NATIVEDIR`. The settings UI consumes the optional catalog field without changing bridge protocol version 1.

**Tech Stack:** Kotlin, Android PackageManager/Context/SharedPreferences, `org.json`, JUnit 4, SDL2 Android renderer loader, React + TypeScript, Gradle Android application modules, PowerShell build checks.

**Spec:** [docs/superpowers/specs/2026-11-18-renderer-apk-plugin-design.md](../specs/2026-11-18-renderer-apk-plugin-design.md)

## Global Constraints

- Android minSdk is 28 and the launcher APK targets `arm64-v8a`.
- Plugin discovery action is `dev.tml.mobilelauncher.action.RENDERER_PLUGIN`.
- Plugin manifest asset is `assets/tml-renderer/manifest.json`; `protocolVersion` is `1`.
- The v1 external backend allowlist is `gl4es`, `angle`, and `mobileglues`; `native` remains the built-in default, while `zink`, `dxvk`, and Vulkan remain unavailable.
- Use an Android `<queries>` intent declaration; do not add `QUERY_ALL_PACKAGES`.
- Copy renderer libraries only to app-private `filesDir/renderers/`; verify SHA-256 during discovery and staging; publish a staged directory only after all libraries pass.
- Select external renderers through `FNA3D_OPENGL_DRIVER` and `RALCORE_NATIVEDIR`; preserve existing `FNA3D_FORCE_DRIVER=OpenGL`, GLES 3 shader profile, and render-scale behavior.
- Keep bridge protocol version `1`; the renderer catalog is an optional snapshot field.
- The renderer fixture APK and its libraries must not be packaged in the production launcher APK.

## File Map

- `android/app/src/main/java/dev/tml/mobilelauncher/feature/renderers/RendererBackend.kt`: backend allowlist and required native library names.
- `android/app/src/main/java/dev/tml/mobilelauncher/feature/renderers/RendererPluginDescriptor.kt`: immutable plugin/library models, stable identity, JSON parser, and per-entry diagnostics.
- `android/app/src/main/java/dev/tml/mobilelauncher/feature/renderers/RendererPluginPackageSource.kt`: package/assets source interface and Android PackageManager implementation.
- `android/app/src/main/java/dev/tml/mobilelauncher/feature/renderers/RendererPluginAssetStager.kt`: private, atomic, digest-checked library staging.
- `android/app/src/main/java/dev/tml/mobilelauncher/feature/renderers/RendererPluginRepository.kt`: catalog discovery, compatibility filtering, cache reuse, and launch-time revalidation.
- `android/app/src/main/AndroidManifest.xml`: package visibility query for the renderer service action.
- `android/app/src/main/java/dev/tml/mobilelauncher/feature/launcher/LauncherController.kt`: asynchronous catalog refresh, snapshot serialization, and preference validation.
- `android/app/src/main/java/dev/tml/mobilelauncher/feature/launcher/LauncherSettings.kt`: backward-compatible selected renderer preference.
- `android/app/src/main/java/dev/tml/mobilelauncher/core/runtime/GameRuntime.kt`: launch-time resolver and renderer environment setup/fallback.
- `android/app/src/test/java/dev/tml/mobilelauncher/feature/renderers/`: parser, repository, cache, and staging unit tests.
- `ui/launcher/src/native/models.ts`: optional renderer option model and preference key.
- `ui/launcher/src/features/native/settings.tsx`: real renderer selector in the Android runtime settings.
- `ui/launcher/tests/`: native fixture and selector interaction assertions.
- `docs/renderer-plugin.md`: plugin author contract, manifest, descriptor, ABI asset layout, and build procedure.
- `android/renderer-plugin-fixture/`: test-only APK with marker service and generated GL4ES assets.
- `scripts/build/prepare-renderer-fixture.ps1`: creates ignored fixture assets from a supplied GL4ES library directory and computes the descriptor hashes.

### Task 1: Define and Validate the Plugin Descriptor

**Files:**
- Create: `android/app/src/main/java/dev/tml/mobilelauncher/feature/renderers/RendererBackend.kt`
- Create: `android/app/src/main/java/dev/tml/mobilelauncher/feature/renderers/RendererPluginDescriptor.kt`
- Create: `android/app/src/test/java/dev/tml/mobilelauncher/feature/renderers/RendererPluginDescriptorTest.kt`

**Interfaces:**
- `RendererBackend` is an enum with `GL4ES`, `ANGLE`, and `MOBILEGLUES`, each returning its exact required library filename set. `fromId(value: String): RendererBackend?` returns `null` for unsupported values.
- `RendererPluginLibrary(fileName: String, assetPath: String, sha256: String)` holds one validated asset.
- `RendererPlugin(packageName: String, packageVersionName: String?, packageVersionCode: Long, rendererId: String, displayName: String, description: String, backend: RendererBackend, minAndroidApi: Int, abis: Set<String>, libraries: List<RendererPluginLibrary>)` is one manifest entry.
- `RendererPlugin.identity` is the stable string `"$packageName:$rendererId"`.
- `RendererPluginParseResult(plugins: List<RendererPlugin>, diagnostics: List<String>)` preserves valid entries when another entry in the same APK is invalid.
- `RendererPluginDescriptorParser.parse(packageName: String, packageVersionName: String?, packageVersionCode: Long, json: JSONObject): RendererPluginParseResult` rejects an unsupported root protocol version and validates each renderer entry independently.

- [ ] **Step 1: Write parser tests for valid and rejected entries**

Create a test helper returning a JSON object with one GL4ES entry. Assert it produces identity `dev.example.renderer:gl4es`, the package version is retained, and the required filenames are exactly `libGL_gl4es.so` and `libEGL_gl4es.so`. Add tests for an unknown protocol version, unknown backend, duplicate renderer ID, missing required library, wrong library filename, non-64-character digest, uppercase digest, path traversal, and one invalid entry beside one valid entry.

```kotlin
@Test
fun validGl4esEntryHasPackageScopedIdentityAndFixedLibraries() {
    val result = RendererPluginDescriptorParser.parse(
        "dev.example.renderer",
        "1.2",
        12L,
        validManifest(),
    )

    assertEquals(emptyList<String>(), result.diagnostics)
    assertEquals("dev.example.renderer:gl4es", result.plugins.single().identity)
    assertEquals(setOf("libGL_gl4es.so", "libEGL_gl4es.so"),
        result.plugins.single().libraries.map { it.fileName }.toSet())
}
```

- [ ] **Step 2: Run the focused test and confirm it fails because parser types do not exist**

Run from `android/`:

```powershell
.\gradlew.bat :app:testDebugUnitTest --tests "dev.tml.mobilelauncher.feature.renderers.RendererPluginDescriptorTest" --console=plain
```

Expected: compilation fails on the new parser/model references.

- [ ] **Step 3: Implement immutable models and strict per-entry parsing**

Use the enum's fixed expected filename sets rather than accepting arbitrary native library names. Validate IDs against `^[a-z0-9][a-z0-9._-]{0,63}$`, package names from PackageManager, `minAndroidApi >= 28`, a non-empty ABI list, a 64-character lowercase hexadecimal SHA-256, and asset paths beginning with `tml-renderer/` with no empty, `.` or `..` segments. Reject duplicate IDs within the APK and keep diagnostics for invalid sibling entries.

- [ ] **Step 4: Re-run the focused parser tests**

Run the focused Gradle command from Step 2. Expected: all parser cases pass, including the valid-sibling case.

- [ ] **Step 5: Commit the descriptor boundary**

```powershell
git add android/app/src/main/java/dev/tml/mobilelauncher/feature/renderers/RendererBackend.kt android/app/src/main/java/dev/tml/mobilelauncher/feature/renderers/RendererPluginDescriptor.kt android/app/src/test/java/dev/tml/mobilelauncher/feature/renderers/RendererPluginDescriptorTest.kt
git commit -m "feat(renderers): define plugin descriptor v1"
```

### Task 2: Discover Installed Plugins and Stage Libraries

**Files:**
- Create: `android/app/src/main/java/dev/tml/mobilelauncher/feature/renderers/RendererPluginPackageSource.kt`
- Create: `android/app/src/main/java/dev/tml/mobilelauncher/feature/renderers/RendererPluginAssetStager.kt`
- Create: `android/app/src/main/java/dev/tml/mobilelauncher/feature/renderers/RendererPluginRepository.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/test/java/dev/tml/mobilelauncher/feature/renderers/RendererPluginRepositoryTest.kt`
- Create: `android/app/src/test/java/dev/tml/mobilelauncher/feature/renderers/RendererPluginAssetStagerTest.kt`

**Interfaces:**
- `InstalledRendererPackage(packageName: String, versionName: String?, versionCode: Long, openAsset: (String) -> InputStream)` gives the repository package identity and a scoped asset reader.
- `RendererPluginPackageSource.queryInstalled(): List<InstalledRendererPackage>` is implemented by `AndroidRendererPluginPackageSource(context: Context)` using `PackageManager.queryIntentServices()` for the exact v1 action.
- `RendererPluginOption(identity: String, packageName: String, packageVersionName: String?, rendererId: String, displayName: String, description: String, backend: RendererBackend)` is the UI-safe catalog record; it contains no arbitrary path or environment values.
- `RendererPluginCatalog(options: List<RendererPluginOption>, diagnostics: List<String>)` always retains the built-in option and isolates bad packages.
- `StagedRenderer(identity: String, backend: RendererBackend, libraryDirectory: File)` is the only runtime-facing result.
- `RendererPluginRepository(source, stager, sdkInt: Int, supportedAbis: List<String>).discover(): RendererPluginCatalog` filters unsupported API/ABI/backend entries and verifies resource hashes with a cache keyed by package version and descriptor digest.
- `RendererPluginRepository.stage(identity: String): StagedRenderer` re-queries the package, reparses the descriptor, verifies again while copying, and throws a descriptive error if the selection is no longer valid.
- `RendererPluginAssetStager.stage(plugin: RendererPlugin, openAsset: (String) -> InputStream): StagedRenderer` writes under `filesDir/renderers/<package>/<versionCode>/<rendererId>/` via a temporary directory and only promotes a complete digest-verified set.

- [ ] **Step 1: Write repository tests using a fake package source**

Test that an arm64/API-compatible GL4ES entry appears, unsupported ABI/API/backend entries are omitted, one malformed package does not suppress a valid package, and duplicate package-scoped identities are diagnosed. The fake asset reader returns in-memory bytes with their computed SHA-256.

```kotlin
@Test
fun discoverKeepsCompatiblePluginAndSkipsUnsupportedSibling() {
    val catalog = repositoryWith(fakePackage(validGl4esManifest(), invalidAbiManifest())).discover()

    assertEquals(listOf("dev.example.renderer:gl4es"), catalog.options.map { it.identity })
    assertTrue(catalog.diagnostics.isNotEmpty())
}
```

- [ ] **Step 2: Write staging tests for digest mismatch and atomic failure**

Use JUnit `TemporaryFolder`. Verify exact output bytes and cache path on success. On one wrong digest, assert staging throws, no final renderer directory exists, and no temporary directory is reported as usable.

- [ ] **Step 3: Run focused repository/stager tests and confirm missing implementation failures**

Run from `android/`:

```powershell
.\gradlew.bat :app:testDebugUnitTest --tests "dev.tml.mobilelauncher.feature.renderers.RendererPluginRepositoryTest" --tests "dev.tml.mobilelauncher.feature.renderers.RendererPluginAssetStagerTest" --console=plain
```

Expected: compilation fails until the repository and stager are implemented.

- [ ] **Step 4: Implement the Android package source and repository**

Add `<queries><intent><action android:name="dev.tml.mobilelauncher.action.RENDERER_PLUGIN" /></intent></queries>` to the launcher manifest. Resolve matching enabled service packages, read each package version and create its explicit package context for `assets/tml-renderer/manifest.json`; do not bind/start the marker service. Convert lookup failures into per-package diagnostics.

- [ ] **Step 5: Implement atomic private asset staging and repository revalidation**

Stream each declared asset into a temporary directory while computing SHA-256. Reject a mismatch, use an app-owned versioned path, and rename/promote only after all required libraries pass. Re-query the package at `stage(identity)` time so uninstall/update cannot use stale catalog data.

- [ ] **Step 6: Re-run focused tests and verify staging cleanup**

Run the focused Gradle command from Step 3. Expected: valid staging succeeds, and invalid digest leaves no completed directory.

- [ ] **Step 7: Commit discovery and staging**

```powershell
git add android/app/src/main/AndroidManifest.xml android/app/src/main/java/dev/tml/mobilelauncher/feature/renderers android/app/src/test/java/dev/tml/mobilelauncher/feature/renderers
git commit -m "feat(renderers): discover and stage APK plugins"
```

### Task 3: Persist Selection and Publish the Catalog

**Files:**
- Modify: `android/app/src/main/java/dev/tml/mobilelauncher/feature/launcher/LauncherSettings.kt`
- Modify: `android/app/src/main/java/dev/tml/mobilelauncher/feature/launcher/LauncherController.kt`
- Modify: `android/app/src/main/java/dev/tml/mobilelauncher/feature/launcher/ui/MainActivity.kt`
- Create: `android/app/src/test/java/dev/tml/mobilelauncher/feature/renderers/RendererSelectionTest.kt`

**Interfaces:**
- `LauncherSettings.read().optString("rendererPlugin", "native")` is the backward-compatible preference read.
- `LauncherSettings.save()` accepts `rendererPlugin` only as `native` or a syntactically valid package-scoped key; it continues rejecting unknown preference keys.
- `LauncherController.refreshRendererCatalog()` performs `discover()` on its existing worker, stores JSON options/diagnostics in controller state, then emits a snapshot on the main handler.
- `LauncherController.snapshot()` always includes `renderers: [...]`, initially containing `native` until discovery completes.
- `LauncherController.settings.save` validates a non-native selection against the latest compatible cached catalog before calling `LauncherSettings.save()`.
- `MainActivity.onResume()` calls `controller.refreshRendererCatalog()`; it does not scan packages synchronously on the UI thread.

- [ ] **Step 1: Write pure selection validation tests**

Test `native`, valid `package:id`, empty input, malformed package/id segments, and a syntactically valid key not present in the catalog. The catalog validator must reject the latter even when the key syntax is valid.

```kotlin
@Test
fun selectionMustBePresentInCompatibleCatalog() {
    assertTrue(RendererSelection.isAvailable("native", emptySet()))
    assertTrue(RendererSelection.isAvailable("dev.example.renderer:gl4es", setOf("dev.example.renderer:gl4es")))
    assertFalse(RendererSelection.isAvailable("dev.other.renderer:gl4es", setOf("dev.example.renderer:gl4es")))
}
```

- [ ] **Step 2: Run the focused selection test and confirm failure**

Run from `android/`:

```powershell
.\gradlew.bat :app:testDebugUnitTest --tests "dev.tml.mobilelauncher.feature.renderers.RendererSelectionTest" --console=plain
```

Expected: missing selection helper causes compilation failure.

- [ ] **Step 3: Implement selection validation and persistence**

Add a pure `RendererSelection` helper and the `rendererPlugin` preference validation. Keep missing preference values equivalent to `native`; do not rewrite preferences merely by reading them.

- [ ] **Step 4: Add catalog state and asynchronous resume refresh**

Inject one `RendererPluginRepository` into `LauncherController`. Add native and compatible plugin options to the snapshot, refresh them on the existing executor, and emit after completion. On settings save, reject non-native keys absent from the latest catalog.

- [ ] **Step 5: Re-run selection tests and add controller snapshot assertions**

Run the focused Gradle command from Step 2 and assert the serialized snapshot contains `renderers`, selected `preferences.rendererPlugin`, package name, backend ID, and package version. Expected: tests pass and old snapshots can still be read by the TypeScript model.

- [ ] **Step 6: Commit catalog and preference bridge**

```powershell
git add android/app/src/main/java/dev/tml/mobilelauncher/feature/launcher/LauncherSettings.kt android/app/src/main/java/dev/tml/mobilelauncher/feature/launcher/LauncherController.kt android/app/src/main/java/dev/tml/mobilelauncher/feature/launcher/ui/MainActivity.kt android/app/src/main/java/dev/tml/mobilelauncher/feature/renderers/RendererSelection.kt android/app/src/test/java/dev/tml/mobilelauncher/feature/renderers/RendererSelectionTest.kt
git commit -m "feat(renderers): expose and persist renderer choices"
```

### Task 4: Apply the Selected Backend Before CoreCLR

**Files:**
- Modify: `android/app/src/main/java/dev/tml/mobilelauncher/core/runtime/GameRuntime.kt`
- Create: `android/app/src/main/java/dev/tml/mobilelauncher/feature/renderers/RendererLaunchEnvironment.kt`
- Create: `android/app/src/test/java/dev/tml/mobilelauncher/feature/renderers/RendererLaunchEnvironmentTest.kt`

**Interfaces:**
- `RendererLaunchEnvironment.forRenderer(renderer: StagedRenderer?): Map<String, String>` returns an empty map for `native`; for a staged plugin it returns `FNA3D_OPENGL_DRIVER=<backend id>` and `RALCORE_NATIVEDIR=<libraryDirectory>`.
- `RendererPluginRepository.stage(identity)` is called immediately before environment setup, using the preference re-read in the `:game` process.
- `GameRuntime` applies plugin variables before `NativeCoreClr.nativeLaunch()` and leaves existing OpenGL ES 3, shader profile, render scale, audio, and touch values unchanged.

- [ ] **Step 1: Write launch environment tests**

Assert native mode emits no plugin-specific variables. Assert GL4ES, ANGLE, and MobileGlues produce the exact allowlisted backend name and absolute staged directory. Assert no `RALCORE_RENDERER` alias is used as the selector.

```kotlin
@Test
fun gl4esUsesSdlRendererNameAndStagedLibraryDirectory() {
    val environment = RendererLaunchEnvironment.forRenderer(stagedGl4es())

    assertEquals("gl4es", environment["FNA3D_OPENGL_DRIVER"])
    assertEquals("C:/app/files/renderers/example/12/gl4es", environment["RALCORE_NATIVEDIR"])
    assertFalse(environment.containsKey("RALCORE_RENDERER"))
}
```

- [ ] **Step 2: Run the focused launch environment test and confirm failure**

Run from `android/`:

```powershell
.\gradlew.bat :app:testDebugUnitTest --tests "dev.tml.mobilelauncher.feature.renderers.RendererLaunchEnvironmentTest" --console=plain
```

Expected: compilation fails before the helper exists.

- [ ] **Step 3: Implement launch config and native fallback**

Resolve the persisted identity, call `stage(identity)` for a non-native choice, and apply the returned environment map. Catch resolution/staging failures, report plugin/package/reason through `Log` and `AndroidBridge.setStartupStatus`, then continue without plugin variables so SDL selects native OpenGL ES 3. Do not fail game launch solely because a plugin disappeared.

- [ ] **Step 4: Re-run focused tests and verify existing runtime variables remain**

Run the focused Gradle command from Step 2. Expected: environment tests pass; inspect `GameRuntime` to confirm `FNA3D_FORCE_DRIVER=OpenGL`, `FNA3D_OPENGL_FORCE_ES3=1`, `FNA3D_MOJOSHADER_PROFILE=glsles3`, and render-scale setup are unchanged.

- [ ] **Step 5: Commit runtime selection**

```powershell
git add android/app/src/main/java/dev/tml/mobilelauncher/core/runtime/GameRuntime.kt android/app/src/main/java/dev/tml/mobilelauncher/feature/renderers/RendererLaunchEnvironment.kt android/app/src/test/java/dev/tml/mobilelauncher/feature/renderers/RendererLaunchEnvironmentTest.kt
git commit -m "feat(renderers): select plugin before game startup"
```

### Task 5: Add the Settings Selector and Plugin Author Documentation

**Files:**
- Modify: `ui/launcher/src/native/models.ts`
- Modify: `ui/launcher/src/features/native/settings.tsx`
- Modify: `ui/launcher/tests/` native state fixture and runtime settings test
- Create: `docs/renderer-plugin.md`

**Interfaces:**
- `NativeRenderer` includes `identity`, `packageName`, `packageVersion`, `rendererId`, `displayName`, `description`, and `backend`.
- `NativeSnapshot.renderers?: NativeRenderer[]` is optional; `NativePreferences.rendererPlugin?: string` is optional and defaults to `native`.
- The runtime settings selector submits `{ preferences: { rendererPlugin: identity } }` through the existing `settings.save` request.

- [ ] **Step 1: Extend the native UI fixture and write selector behavior tests**

Add `native` and one GL4ES plugin to the fixture. Assert that the options are shown, the selected identity is rendered, selecting another option sends one `settings.save` request, and an empty catalog shows the built-in native choice only.

```ts
expect(screen.getByRole('combobox', { name: '渲染器' })).toHaveValue('native');
await user.selectOptions(screen.getByRole('combobox', { name: '渲染器' }), 'dev.example.renderer:gl4es');
expect(nativeRequest).toHaveBeenCalledWith('settings.save', {
  preferences: { rendererPlugin: 'dev.example.renderer:gl4es' },
});
```

- [ ] **Step 2: Run the focused browser test and confirm it fails**

Run from `ui/launcher/`:

```powershell
npm test -- --runInBand
```

Expected: the current fixed badge has no renderer combobox and the new assertions fail.

- [ ] **Step 3: Implement the selector and optional native snapshot types**

Replace the fixed renderer badge with the existing `Select` control. Derive options from `nativeState.renderers`, always include `native`, show package/version in the option label or description, send `settings.save`, and report errors through the existing notification path.

- [ ] **Step 4: Re-run browser tests, type checks, and formatting**

Run from `ui/launcher/`:

```powershell
npm test
npm run check
npm run format:check
```

Expected: all browser suites, TypeScript, and Prettier checks pass.

- [ ] **Step 5: Write plugin author documentation**

Document the marker service action, `<queries>` entry for the launcher, fixed manifest asset path, every JSON field, valid SHA-256 generation, required filenames for each supported backend, Android API/ABI rules, the non-execution of the marker service, plugin trust implications, and a minimal Gradle/Manifest layout. State that unsupported backend IDs are rejected.

- [ ] **Step 6: Commit settings and author documentation**

```powershell
git add ui/launcher/src/native/models.ts ui/launcher/src/features/native/settings.tsx ui/launcher/tests docs/renderer-plugin.md
git commit -m "feat(renderers): add plugin selector and author guide"
```

### Task 6: Verify the Contract APK and Device Launch Path

**Files:**
- Create: `android/renderer-plugin-fixture/build.gradle.kts`
- Create: `android/renderer-plugin-fixture/src/main/AndroidManifest.xml`
- Create: `android/renderer-plugin-fixture/src/main/java/dev/tml/rendererfixture/RendererPluginMarkerService.kt`
- Create: generated, ignored `build/renderer-plugin-fixture-assets/tml-renderer/manifest.json` and ABI library assets
- Create: `scripts/build/prepare-renderer-fixture.ps1`
- Modify: `android/settings.gradle.kts` to include the test-only fixture module

**Interfaces:**
- Fixture application ID is `dev.tml.mobilelauncher.rendererfixture`; its service exports only the v1 renderer action and never needs to be bound.
- `prepare-renderer-fixture.ps1 -LibraryDirectory <arm64 directory>` accepts `libGL_gl4es.so` and `libEGL_gl4es.so`, copies them into ignored generated assets, computes lowercase SHA-256 with `Get-FileHash`, and writes the v1 descriptor with backend `gl4es`.
- The fixture APK is installed separately and is never a dependency of `:app` packaging.

- [ ] **Step 1: Add fixture application and generated-asset packaging**

Create a minimal Android app module with the exported marker service and add it to `android/settings.gradle.kts`. Configure its assets source to read only `build/renderer-plugin-fixture-assets`; leave the directory absent from version control and fail the fixture build with a clear message if its descriptor or required libraries are missing.

- [ ] **Step 2: Add the fixture preparation script**

Validate the two exact GL4ES filenames, copy them under `tml-renderer/arm64-v8a/`, compute each file's SHA-256, and emit the complete manifest with `protocolVersion: 1`, `rendererId: gl4es`, backend `gl4es`, minimum API 28, and ABI `arm64-v8a`. Keep generated files under root `build/` only.

- [ ] **Step 3: Build the fixture from the source project's existing GL4ES output**

Run the preparation script against the already-built arm64 GL4ES library directory under `D:\RotatingartLauncher\app\build\intermediates\merged_native_libs\debug\mergeDebugNativeLibs\out\lib\arm64-v8a`, then build:

```powershell
Push-Location android
.\gradlew.bat :renderer-plugin-fixture:assembleDebug --console=plain
Pop-Location
```

Expected: the separate fixture APK contains the descriptor and both libraries under assets; the launcher APK dependency graph remains unchanged.

- [ ] **Step 4: Run full managed, Android, APK, and browser verification**

Run:

```powershell
.\scripts\checks\verify.ps1 -Android -Assemble
Push-Location ui/launcher
npm test
npm run format:check
Pop-Location
```

Expected: all managed/JVM/native-runtime checks pass, `:app:assembleDebug` succeeds, and APK inspection confirms the renderer fixture libraries are absent from the launcher APK.

- [ ] **Step 5: Install both APKs and verify detection, persistence, and native load**

Install the fixture and rebuilt launcher APK on a connected arm64 Android 9+ device. Open Settings and confirm the fixture appears with package/version, select GL4ES, leave and reopen the launcher, and confirm the choice remains. Launch the installed tML game; use `adb logcat -s SDL_Renderer FnaAndroidCoreClr` to confirm `FNA3D_OPENGL_DRIVER=gl4es`, the private `RALCORE_NATIVEDIR`, successful EGL/GLES library loading, and game first-frame completion. Uninstall the fixture and repeat launch; confirm native OpenGL ES 3 fallback and a diagnostic reason.

- [ ] **Step 6: Commit the fixture and final verification support**

```powershell
git add android/settings.gradle.kts android/renderer-plugin-fixture scripts/build/prepare-renderer-fixture.ps1
git commit -m "test(renderers): verify APK plugin on Android"
```

## Final Review Checklist

- Compare each acceptance criterion in the spec against Tasks 1-6; do not mark a criterion complete from unit tests alone when it requires PackageManager or device execution.
- Run `git diff --check` and verify generated fixture libraries remain under ignored `build/`.
- Verify the launcher APK still contains no renderer plugin libraries and the source worktree `D:\RotatingartLauncher` remains untouched.
- If device rendering fails while discovery, verification, or fallback passes, report the exact native loader diagnostic and keep that backend unavailable rather than claiming it is supported.
