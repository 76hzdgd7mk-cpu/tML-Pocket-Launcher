# tML Multiple Versions Implementation Plan

**Goal:** Independently install tML releases, persist the selected launch version, and uninstall a specified release without touching shared Terraria resources or user data.

**Architecture:** Keep the existing installer and durable journal. Add a version catalog keyed by opaque identifiers, retaining `games/tmodloader` as the legacy installation. Store additional versions in UUID-derived directories. Continue exposing the selected release through `installation()` so runtime paths follow selection. Keep the bridge snapshot's `tml` field for compatibility.

**Tech Stack:** Kotlin/JVM filesystem transactions, JSON metadata, React/TypeScript, existing native bridge and Playwright fixtures.

## Execution in the current workspace

- [x] Add JVM fixtures for side-by-side installs, persisted selection, same-version replacement, legacy metadata, uninstall and interrupted transactions. Run them before implementation to confirm the missing behavior.
- [x] Add `TmlVersionCatalog.kt` for catalog metadata and identifier validation; extend `GamePackageInstaller.kt` journal recovery for version destinations and uninstall. Keep format-1 journal recovery intact.
- [x] Add `versions.select` and `versions.uninstall` controller operations and `installedVersions` snapshot data. Guard mutations while the game is running, and read logs from all version directories.
- [x] Add a live version manager used by the game page and launch selector, with availability/current labels, selection, uninstall confirmation and inline error details. Update install descriptions.
- [x] Extend browser bridge fixtures to cover successful and failed selection, canceled/confirmed uninstall, empty installations and responsive layout.
- [x] Run JVM tests, TypeScript/build/format checks, browser suites, APK assembly and package/layout checks. Inspect the changed interface screenshots. Record any unrelated baseline failure accurately.

## Behavior decisions

- Successful installation selects the installed version. A matching normalized version label replaces only that version; a different label installs alongside it.
- Existing single-install metadata remains readable without moving files. Catalog metadata is persisted atomically by the next install/selection/uninstall.
- Damaged installations remain visible for uninstall but cannot be selected. Uninstalling the active release selects the first remaining validated release, or clears selection if none is usable.
- Shared `userdata/` (including saves and mods), `games/terraria/`, runtime and launcher files are never uninstall targets.
- Version IDs are `legacy` or canonical UUIDs. Folder paths are always derived from these IDs; UI parameters and manifest paths cannot supply arbitrary destinations.
- Uninstall renames the target into the journal backup before committing metadata; interruption before commit restores it, and interruption after commit resumes cleanup.
- No commits, pushes, device installation or changes to live game data are part of this task.

## Verification on 2026-11-20

- Initial regression compilation failed because version-list/select/uninstall APIs were absent; the completed implementation passes the fixtures.
- `:app:assembleDebug :app:testDebugUnitTest`: successful; 99 JVM tests, zero failures/errors, three environment-dependent skips. Installer suite: 48 tests, zero failures, one symbolic-link skip.
- Managed solution build and its separately executed tests passed (57 managed tests). TypeScript, Vite build, changed Web-file Prettier checks, `git diff --check`, APK contents/native dependency closure and repository layout checks passed.
- Browser suites `regression`, `mods`, `animate-ui`, `primitives`, `native-bridge`, `native-versions` and `launch-transition` passed. Version management covers selected/unavailable versions, mutation failures, pending-operation controls, cancel/retry uninstall, inactive/current/last removal and six portrait/landscape sizes. Screenshots were inspected at 390×844 and 800×360.
- Full browser run stops at the existing `settings-navigation.cjs:203` reduced-motion assertion (one running animation instead of zero). The same assertion was reproduced against the previously captured clean-HEAD baseline served separately.
- `scripts/checks/verify.ps1` passes layout/build, then stops at existing managed whitespace violations under external MobileJoystick sources. External sources were not reformatted. Managed tests were run separately afterward.
- APK is generated in the usual Android debug output directory. No device installation, live game-file changes, commit or push was performed. Browser bridge fixtures and JVM filesystems do not establish real-device gameplay compatibility.
