# Android launcher integration

The approved React/Animate UI launcher is the production interface. Package it
offline in the Android application; retain the native game process and imported
tML/FNA packages. No server or development URL is required by the APK.

## Implementation sequence

1. Package Vite assets during Gradle preBuild. Serve only local assets from a
   fixed HTTPS WebView origin; accept bridge messages only from its main frame.
2. Replace the old button-list Activity with the approved interface. Expose typed
   requests, responses and task snapshots; retain the worker across recreation.
3. Connect document-picker imports, GitHub release pagination/download,
   cancellation/retry, installation validation and the existing GameActivity.
4. Implement local TMOD metadata/index, enabled.json, dependency checks, deletion
   and mod-pack persistence without loading game or mod assemblies.
5. Connect actual settings (including launcher orientation and touch visibility),
   storage/cache inspection and logs. Keep unavailable account services explicit;
   never fabricate authentication, ownership, installation or task success.
6. Connect optional declarative launch patches and public Workshop access with
   explicit errors when Steam does not offer an anonymous downloadable file.
7. Verify native unit tests, Web bridge integration/regressions, packaged asset
   boundaries and arm64 APK build. Document remaining external-service/runtime
   limitations alongside the artifact.

## Boundaries

`ui/launcher/src/native` owns bridge transport/models. Production feature panels
reuse the approved controls and CSS. Pure Kotlin repositories own metadata and
atomic local writes; the launcher controller serializes file mutations. Activity
code owns WebView, Android document pickers, sharing, navigation and orientation.
External pages never receive a privileged bridge. Game startup remains a separate
Android process; launcher direction does not change the game's landscape mode.

## Verification

- `node ui/launcher/tests/run.cjs` (from the UI directory): production browser suites.
- `android/gradlew.bat :app:testDebugUnitTest :app:assembleDebug --console=plain`:
  TMOD, repository, release and package tests plus packaged application.
- `scripts/checks/check-apk.ps1`: offline UI and launcher/runtime files are present,
  with no bundled tML/FNA.dll or Terraria Content.
- Browser bridge fixture: native state replaces sample data, task updates and
  native errors render, imports call the bridge, orientation persists.

Implementation is performed in this chat without changing unrelated existing edits.
