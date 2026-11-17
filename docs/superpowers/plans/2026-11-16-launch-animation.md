# Game launch animation implementation plan

**Goal:** Integrate the approved glass launch transition with actual validation, native runtime preparation and the first presented game frame.

**Architecture:** A focused React launch feature owns its modal state and consumes explicit native validation stages. A matching native overlay survives the Activity handoff; a one-shot FNA Present adapter fades it only after a successful presentation. Failure and Activity return restore usable launcher controls.

**Stack:** Existing React, Radix focus management, CSS/WAAPI, Kotlin Android Canvas, existing MonoMod runtime hooks. Execute in this session; preserve installed resources, account sessions and all unrelated edits.

- [x] Add explicit validation stages and a bounded read-only logs path in LauncherController; guard duplicate native launch requests and emit game-return lifecycle events from MainActivity.
- [x] Add a launch-transition provider, modal and scoped CSS; replace LaunchDock's direct RPC. Use real snapshots, pending state, retry/Steam/return actions and logs. Respect motion preference and reduced motion. Use the approved sequential layout, not percentage positioning.
- [x] Replace GameActivity's legacy startup panel with matching native artwork, status, log/return actions and compositor fade. Keep runtime preparation visible, stop animation while paused/detached and preserve actual error details.
- [x] Hook successful FNA Present through a reusable one-shot signal; test that failed presentation never dismisses the overlay and subsequent frames do not repeat dismissal.
- [x] Extend the native UI fixture for slow validation, repeated presses, failure, logs, retries, game return, reduced motion and short landscape/portrait layouts. Run managed tests before Gradle to avoid shared publish output contention.
- [x] Format, typecheck, run the UI fixture, Android unit tests and APK checks; bump to 0.1.8, install with adb install -r -t and verify real startup/return on the connected phone without changing game resources.

Verification: Bootstrap tests 17 passed; Android JVM tests 68 passed and 2 skipped (Windows symlink restrictions); all six existing browser suites and the added launch-transition suite passed. The final geometry-handoff change was checked with the launch-transition and native-bridge suites, TypeScript, formatting, Gradle and APK/layout checks. Real-device launch reaches the native startup/error surface and returns to usable launcher controls. An existing unsupported ref-parameter runtime patch blocks the imported tML before the first frame, so actual game-frame fade remains unverified on-device. No game resources, saves or account sessions were replaced.

Follow-up 0.1.9: the out-parameter runtime patch and desktop SteamGameServer fallback were repaired. The same imported release now completes mod loading and reaches Chinese menus/player selection on-device, confirming actual first-frame handoff. Bootstrap tests now total 20 passing; store tests total 42 passing. Full project verification and launcher-only APK inspection pass. No character/world creation or in-world gameplay was exercised.

Validation commands: `dotnet test managed/tests/MobileLauncher.Bootstrap.Tests/MobileLauncher.Bootstrap.Tests.csproj`, `node tests/run.cjs` from ui/launcher, `android/gradlew.bat -p android :app:testDebugUnitTest :app:assembleDebug`, `scripts/checks/check-layout.ps1`, `scripts/checks/check-apk.ps1` and a connected-device launch exercise. A failed game launch is reported as such; displaying the animation is not proof of game compatibility.
