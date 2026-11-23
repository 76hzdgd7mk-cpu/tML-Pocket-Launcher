# Steam Workshop Discovery and Downloads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add searchable Terraria and tModLoader Workshop catalogs with Steam-session-aware UGC downloads and validated automatic installation.

**Architecture:** Keep Steam Workshop protocol work in `MobileLauncher.Stores`, which owns SteamKit sessions and progress events. Keep installation of downloaded files in the Android app, which owns user-data paths and existing mod validation. Extend the current native bridge and Workshop page rather than introducing another task system.

**Tech Stack:** Kotlin/JVM Android, C# .NET 10, SteamKit2 3.5.0, React/TypeScript, xUnit, Node/Playwright UI tests.

---

## File Map

- Modify `managed/MobileLauncher.Stores/SteamSession.cs` to expose a Workshop operation over its current authenticated `SteamClient` without taking ownership of or disconnecting that client.
- Create `managed/MobileLauncher.Stores/WorkshopService.cs` for app-scoped Workshop query mapping and UGC transfer orchestration. Keep protocol-specific query/download code out of the top-level socket loop.
- Modify `managed/MobileLauncher.Stores/Program.cs` to route `workshop.query`, `workshop.details`, and `workshop.download`, serialize results, publish progress, and cancel the current operation.
- Create focused managed tests under `managed/tests/MobileLauncher.Stores.Tests/` for query mapping, session selection, and transport error/cancellation behavior.
- Create `android/app/src/main/java/app/com/tmlpocket/feature/mods/WorkshopContentInstaller.kt` to stage, classify, validate, and install `.tmod`, `.wld`/`.twld`, and resource-pack payloads below launcher-owned user data.
- Modify `android/app/src/main/java/app/com/tmlpocket/feature/mods/WorkshopClient.kt` only for legacy direct-link compatibility if it remains useful; remove the old single-app assumption from active request handling.
- Modify `android/app/src/main/java/app/com/tmlpocket/feature/launcher/LauncherController.kt` to forward catalog operations to the managed service, install returned staged payloads, and preserve the current mutation lock/progress lifecycle.
- Create focused Kotlin tests under `android/app/src/test/java/app/com/tmlpocket/feature/mods/` for classification, archive safety, destination selection, and rollback.
- Modify `ui/launcher/src/features/native/workshop.tsx` for separate Terraria/tModLoader catalogs, filter and sort controls, item results/details, and typed download requests.
- Modify `ui/launcher/src/native/bridge.ts` if the existing native method allowlist needs the new Workshop query/detail methods.
- Extend `ui/launcher/tests/resource-browser.cjs` with fixtures for both app IDs, filter/sort requests, empty/error states, and download actions.
- Update `docs/android-launcher.md` and `docs/getting-started.md` after actual supported behavior and constraints are verified.

## Task 1: Confirm and Model Steam Workshop Protocol

**Files:**
- Create: `managed/tests/MobileLauncher.Stores.Tests/WorkshopProtocolTests.cs`
- Create: `managed/MobileLauncher.Stores/WorkshopService.cs`
- Modify: `managed/MobileLauncher.Stores/SteamSession.cs`

- [ ] **Step 1: Add request-mapping tests**

Create tests for accepting only app IDs `105600` and `1281930`, preserving app ID in returned results, validating page size/search length, and mapping sort/category values to the SteamKit Workshop query request. Use an injected query executor so tests do not connect to Steam.

- [ ] **Step 2: Run tests and verify failures**

Run: `dotnet test managed/tests/MobileLauncher.Stores.Tests/MobileLauncher.Stores.Tests.csproj --filter FullyQualifiedName~WorkshopProtocolTests`

Expected: FAIL because the Workshop service and query mapping do not exist.

- [ ] **Step 3: Implement bounded query contracts**

Define an internal query model with `AppId`, `Search`, `Category`, `Sort`, `Page`, and `PageSize`. Define item results with `AppId`, `PublishedFileId`, title, description, creator, preview URL, tags, created/updated timestamps, subscriptions, and rating fields when present. Map only explicit supported sort/category values; reject unknown app IDs and clamp page size to 1-30.

- [ ] **Step 4: Bind query operations to the current Steam session**

Add a `SteamSession` method which snapshots the connected session under the existing lock, verifies it remains ready and connected after the request, and queries through that client's SteamKit unified messages handler. The service must not dispose or log out the session. Keep an injected executor for deterministic tests.

- [ ] **Step 5: Run managed Workshop tests**

Run: `dotnet test managed/tests/MobileLauncher.Stores.Tests/MobileLauncher.Stores.Tests.csproj --filter FullyQualifiedName~WorkshopProtocolTests`

Expected: PASS with no network or account required.

## Task 2: Add Session-Aware UGC Transfer

**Files:**
- Modify: `managed/MobileLauncher.Stores/WorkshopService.cs`
- Modify: `managed/MobileLauncher.Stores/SteamSession.cs`
- Modify: `managed/MobileLauncher.Stores/SteamConnection.cs` only if an anonymous SteamKit logon path is required
- Create: `managed/tests/MobileLauncher.Stores.Tests/WorkshopTransferTests.cs`

- [ ] **Step 1: Add fakeable transfer tests**

Test that a ready logged-in session is selected without creating another connection, signed-out mode selects anonymous access, an item-level access denial becomes a login-required error, cancellation reaches the transport, and a changed/disconnected session cannot report success.

- [ ] **Step 2: Run tests and verify failures**

Run: `dotnet test managed/tests/MobileLauncher.Stores.Tests/MobileLauncher.Stores.Tests.csproj --filter FullyQualifiedName~WorkshopTransferTests`

Expected: FAIL because the session-aware transfer adapter does not exist.

- [ ] **Step 3: Verify the downloader's session contract before selecting implementation**

Inspect the checked-in SteamPatch `ContentDownloader` usage and the resolved SteamKit2 3.5.0 public API. Do not add its desktop `DepotDownloader.dll` as a dependency: the reference invokes it through a separate static anonymous session. Implement the UGC transport using the existing SteamKit connection's authenticated client when logged in; when signed out, use an isolated anonymous SteamKit connection with explicit lifetime ownership. If an Android-compatible transport API is unavailable, stop before adding a parallel authenticated login and report the concrete constraint.

- [ ] **Step 4: Implement UGC transfer with staged output**

Transfer into a unique temporary directory under the passed launcher-owned root. Reuse the existing session client for logged-in users; never reuse or dispose its client in the transport. Anonymous mode may own and dispose its own connection. Return only a completed staged result containing app ID, published file ID, and payload file paths. Check cancellation between metadata, manifest, file, and chunk operations; publish bounded progress values.

- [ ] **Step 5: Run transfer tests and managed suite**

Run: `dotnet test managed/tests/MobileLauncher.Stores.Tests/MobileLauncher.Stores.Tests.csproj --filter FullyQualifiedName~WorkshopTransferTests`

Expected: PASS without contacting Steam.

Run: `dotnet test managed/tests/MobileLauncher.Stores.Tests/MobileLauncher.Stores.Tests.csproj`

Expected: all managed store tests PASS.

## Task 3: Route Workshop Queries and Downloads Through Store Host

**Files:**
- Modify: `managed/MobileLauncher.Stores/Program.cs`
- Create: `managed/tests/MobileLauncher.Stores.Tests/WorkshopProtocolTests.cs` additions for request dispatch if socket dispatch is extracted

- [ ] **Step 1: Define socket request fixtures**

Cover `workshop.query`, `workshop.details`, and `workshop.download` request payloads, result JSON, progress events, cancellation, invalid app IDs, and login-required errors. Extract a small dispatcher only if that enables direct tests without opening production sockets.

- [ ] **Step 2: Register Workshop routes**

Route each operation to `WorkshopService`; include app ID and published file ID in download parameters. Add Workshop downloads to the existing cancellation-token source and long-running task timeout. Preserve the current single-operation gate and existing error sanitization.

- [ ] **Step 3: Run managed store tests**

Run: `dotnet test managed/tests/MobileLauncher.Stores.Tests/MobileLauncher.Stores.Tests.csproj`

Expected: PASS, including dispatch fixtures and existing Steam/GOG session tests.

## Task 4: Validate and Install Downloaded Content

**Files:**
- Create: `android/app/src/main/java/app/com/tmlpocket/feature/mods/WorkshopContentInstaller.kt`
- Modify: `android/app/src/main/java/app/com/tmlpocket/feature/mods/ModRepository.kt` only to expose an install helper that retains `TmodReader` validation and built-in-mod protections
- Create: `android/app/src/test/java/app/com/tmlpocket/feature/mods/WorkshopContentInstallerTest.kt`

- [ ] **Step 1: Write classification and path-safety tests**

Create fixtures for a valid `.tmod`, a Terraria `.wld` with optional `.twld`, a resource-pack directory/archive containing `pack.json`, malformed ZIP entries, `../` traversal, absolute paths, symlinks, duplicate names, excessive expanded size, and ambiguous mixed payloads.

- [ ] **Step 2: Run installer tests and verify failures**

Run: `gradlew.bat :app:testDebugUnitTest --tests app.com.tmlpocket.feature.mods.WorkshopContentInstallerTest`

Expected: FAIL because the installer/classifier does not exist.

- [ ] **Step 3: Implement staged content classification**

Classify by app ID and validated contents, never by remote title or user-provided path. For tModLoader, accept only `.tmod` files passing `TmodReader.read(file, verifyHash = true)` and reject built-in IDs. For Terraria worlds, accept `.wld` and its matching optional `.twld`. For resource packs, require a valid `pack.json` at the root of a bounded archive or directory. Reject archives with unsafe entries and reject mixed/ambiguous payloads.

- [ ] **Step 4: Implement transactional install destinations**

Install under `context.filesDir/userdata/Mods`, `context.filesDir/userdata/Worlds`, or `context.filesDir/userdata/ResourcePacks`. Stage adjacent to the destination, validate all names and files, refuse symlink destinations, and only then atomically replace the selected same-name item. If commit fails, restore the prior target and delete only task-owned temporary files.

- [ ] **Step 5: Run installer tests**

Run: `gradlew.bat :app:testDebugUnitTest --tests app.com.tmlpocket.feature.mods.WorkshopContentInstallerTest`

Expected: PASS for supported items and all rejection/rollback cases.

## Task 5: Connect Native Launcher Requests

**Files:**
- Modify: `android/app/src/main/java/app/com/tmlpocket/feature/launcher/LauncherController.kt`
- Modify: `android/app/src/main/java/app/com/tmlpocket/feature/stores/StoreRepository.kt` if required to expose the managed request API cleanly
- Modify: `android/app/src/main/java/app/com/tmlpocket/feature/mods/WorkshopClient.kt` to remove the active hard-coded app-1281930 download assumption
- Create or extend: `android/app/src/test/java/app/com/tmlpocket/feature/launcher/LauncherControllerWorkshopTest.kt` if the existing controller test harness supports request/progress tests

- [ ] **Step 1: Add request/response tests**

Verify each query preserves its selected app ID and filters, details validate the item belongs to that app, and download stages through the managed store then invokes the correct installer. Verify cancellation removes only the temporary payload and reports failure without partial install.

- [ ] **Step 2: Route catalog requests**

Forward Workshop query/detail calls to the managed store host. Keep read-only catalog requests outside the game-install mutation gate; keep downloads inside the current busy/game-running/Wi-Fi checks. Add Workshop operation names to existing progress snapshots.

- [ ] **Step 3: Route completed downloads to installer**

Send app ID and item ID to `workshop.download`, receive staged payload metadata, invoke `WorkshopContentInstaller`, and delete the staging directory in `finally`. Do not keep the legacy Kotlin direct-link path as a fallback when Steam reports access denied.

- [ ] **Step 4: Run Android unit tests**

Run: `gradlew.bat :app:testDebugUnitTest`

Expected: PASS, including existing mod repository and compatibility tests.

## Task 6: Build the Two Catalogs and Screenshot-Inspired Filters

**Files:**
- Modify: `ui/launcher/src/features/native/workshop.tsx`
- Modify: `ui/launcher/src/native/bridge.ts`
- Modify: `ui/launcher/tests/resource-browser.cjs`
- Modify relevant Workshop styles in `ui/launcher/src/**/*.css` identified by `rg -n "resource-workshop|resource-catalog" ui/launcher/src`

- [ ] **Step 1: Extend native UI fixtures**

Add deterministic result fixtures for both app IDs, category/tag filters, search text, each sort key, pagination, login-required failure, empty results, and each automatic-install download method. Assert no request crosses between app IDs.

- [ ] **Step 2: Run the focused UI test and verify failures**

Run from `ui/launcher`: `npm test -- --grep workshop`

If the runner does not support a grep argument, run `npm test` and confirm the new Workshop assertions fail before implementation.

- [ ] **Step 3: Implement two catalog modes and filter controls**

Replace the current ID-only workshop view with a Terraria/tModLoader mode switch. Render search, the appropriate category filters, and sort tabs for popular, most subscribed, recently updated, and newest. Keep selected mode/filter/sort/page in component state and request new results when they change. Preserve a detail view and the existing native download task provider.

- [ ] **Step 4: Render real result metadata and states**

Render preview artwork, title, creator, tags, and returned rating/subscription metadata from API data. Add explicit loading, empty, request-failure, and anonymous-access/login-required states. Do not fabricate missing metadata. Use the existing UI component and resource-browser layout conventions.

- [ ] **Step 5: Run UI checks and viewport tests**

Run from `ui/launcher`: `npm test`, `npm run check`, and `npm run build`.

Expected: all tests/build pass; result rows remain readable in compact and wide resource-browser viewports.

## Task 7: Documentation and Integrated Verification

**Files:**
- Modify: `docs/android-launcher.md`
- Modify: `docs/getting-started.md`
- Modify: `README.md` only if the feature summary materially changes

- [ ] **Step 1: Document actual behavior and limitations**

Describe the two Workshop app IDs, supported payload types and install locations, anonymous-versus-logged-in behavior, and any Steam access/runtime constraints demonstrated by tests. Do not claim tested Steam account transfers unless a real-device manual check was performed.

- [ ] **Step 2: Run focused validations**

Run: `dotnet test managed/tests/MobileLauncher.Stores.Tests/MobileLauncher.Stores.Tests.csproj`; `gradlew.bat :app:testDebugUnitTest`; and from `ui/launcher`, `npm test`, `npm run check`, `npm run build`.

Expected: all focused tests/builds pass.

- [ ] **Step 3: Run available repository validation**

Run the repository's documented check/build scripts without altering unrelated files. Record any environment-limited checks, such as lack of a Steam test account or Android device, and report those as unverified.

## Execution Notes

- Preserve all pre-existing workspace changes and avoid edits to the external reference repositories.
- Do not add a desktop-only DepotDownloader binary or native Steamworks DLL to the Android APK.
- No real Steam credentials or authenticated paid content are used in automated tests.
- User requested implementation in this session; execute inline task-by-task and verify each task before continuing.
