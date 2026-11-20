# Resource browser layout

**Goal:** Apply the user's reference layout to real tML resource workflows: a category rail, broad resource cards and a separate search/filter column.

**Scope:** Add a full-page download workspace for game versions, Steam Workshop mods and local mod-pack presets. Keep installation, version selection/uninstall and the managed/native runtime unchanged. Use existing theme tokens and accessible Animate UI controls; fold filters on narrow screens and retain Android Back behavior.

- [x] Inspect the reference screenshots and current navigation, version downloads, Workshop API and mod-pack actions.
- [x] Implement resource routes, contextual category navigation, responsive browser layout and real release search/channel/sort/pagination.
- [x] Share mod-pack and Workshop components between their original pages and the resource workspace. Preserve import/apply/export/delete and details/download actions.
- [x] Add browser fixtures for actual bridge calls, failed/retried paging, search/empty states, categories, mod queries/downloads, mod-pack operations and portrait/landscape layouts.
- [x] Run TypeScript, format, browser regressions and APK assembly/package inspection. Inspect reference-aligned screenshots. Document any existing unrelated failures without claiming a clean full run.

Resource data comes from existing native APIs. Steam name searches open the Workshop website; a numeric ID retrieves real project details. Local mod packs remain JSON enable-list presets. No new remote catalog, demo data, account requirement or runtime change is introduced.

## Verification — November 20, 2026

- TypeScript and the Vite production build passed. All files changed for this layout pass Prettier; `git diff --check` passed.
- Browser regressions: 8 of 9 suites passed (`regression`, `mods`, `animate-ui`, `primitives`, `native-bridge`, `native-versions`, `resource-browser`, `launch-transition`). The previously reproduced `settings-navigation.cjs:203` failure remains: one running animation where the test expects zero. It was not changed in this work.
- The resource suite covers release search/channel/sort, overlapping pages, paging failure, failed refresh retrying page 1, navigation, mod queries and download IDs, foreground/minimized download behavior and task Back navigation, preset save/apply/export/delete and ten viewports from 320 to 1200 CSS pixels. Filter visibility follows the main container width, including the 740/759/760px breakpoint edges. Light/dark and portrait/landscape captures were inspected under ignored `build/ui-previews`.
- The full UI Prettier check still reports the unmodified `index.html` and `public/preview.html`. These files have no worktree diff; their formatting was left unchanged.
- `:app:assembleDebug :app:testDebugUnitTest` succeeded. JVM results: 99 tests, 0 failures/errors, 3 skipped (Gradle reused the unchanged test results). APK and repository layout checks passed; the APK includes the current UI bundle and all three resource routes.
- APK: `android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk`. Not installed on a device. No commit or push. Browser fixtures do not establish live downloads or actual-device game compatibility.
