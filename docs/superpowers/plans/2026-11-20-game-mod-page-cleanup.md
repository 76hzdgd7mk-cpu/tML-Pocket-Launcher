# Game and mod page cleanup

The user requested removal of duplicated functions and confusing game/mod page layouts. Continue in the current worktree, preserving installed-resource, multi-version, download and import/error behavior.

Design: games has Installed and Add game tabs. Installed shows one compact Terraria status and one inline tML version manager. Add game owns official version download, local ZIP import, Steam/GOG account/download and local Terraria import. Legacy account shortcuts resolve to Add game. The native game header has no repeated import action; its launch dock is compact and omits the account shortcut on this page.

Mods has Installed and Mod packs tabs. Add mod offers download-center navigation or local TMOD import. Workshop browsing lives only in the resource workspace. The pack tab's header imports JSON; its body saves/manages presets without a second import button. Legacy browse shortcuts open the download workspace and return to Installed.

- [x] Inspect repeated sections, entry points and affected navigation/tests.
- [x] Implement native game page, contextual mod actions and legacy shortcut routing.
- [x] Verify no duplicate on-page actions, imports/downloads, version management, mod/preset operations and responsive screenshots.
- [x] Run type/format/browser checks, assemble APK and inspect packaged UI. Record existing unrelated failures separately.

Normal browser demonstration workflows remain separate. Do not change native installation/runtime protocols or commit/push/install without a user request.

## Verification — November 20, 2026

- TypeScript and the production Vite build passed. Prettier passed for changed files; `git diff --check` and the repository layout check passed.
- All nine browser suites were run against the final production UI. Eight passed: regression, mods, animate-ui, primitives, native-bridge, native-versions, resource-browser and launch-transition. The existing settings-navigation failure at line 203 remains (one running animation rather than zero); no settings animation code was changed.
- Native fixtures verify two game tabs, one inline version manager, no repeated game-header or dock account action, one acquisition entry per resource type, active/current/last/unavailable version handling, import failure details, Steam/GOG/download flows, contextual pack import, mod multi-import and legacy Workshop routing/Back behavior. Games were checked at 320/390/480/640/800/932px; the resource-browser suite retains ten viewports. Inspected light/dark portrait/landscape screenshots are in ignored `build/ui-previews/games-cleanup-*` and `mods-cleanup-*`.
- `:app:assembleDebug :app:testDebugUnitTest` succeeded. JVM tests were unchanged and reused by Gradle; existing reports contain 99 tests, no failures/errors and 3 skips. APK inspection passed and confirmed the current production UI, the consolidated game page, Add mod action and compact launch dock in the packaged bundle.
- Root `scripts/checks/verify.ps1` was run with the external shared build-props setting. Managed compilation passed; the check stopped on the existing external MobileJoystick whitespace/final-newline errors. Full UI Prettier still reports only the unchanged `index.html` and `public/preview.html`. No external formatting or unrelated HTML edits were made.
- APK: `android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk`. No device installation, commit or push. Browser fixtures do not establish live account downloads or gameplay compatibility.
