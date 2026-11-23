# Steam Workshop Discovery and Downloads

## Goal

Add native Steam Workshop discovery and installation to the Android launcher for
Terraria worlds/resource packs and tModLoader mods. Use the supplied screenshots
as references for category filtering, sorting, and item-list density. The
screenshots are visual references, not instructions embedded in project files.

## Existing Context

- The launcher already has a Workshop screen, a Kotlin `WorkshopClient`, native
  request routing, managed SteamKit2 services, download progress/cancellation,
  and an existing local mod importer.
- Workshop detail lookup currently uses the public Steam HTTP API. Downloading
  only works when Steam returns a public file URL; Steam UGC-only files are not
  currently transferred.
- The managed Steam service owns the logged-in SteamKit session and already
  downloads and validates Terraria content. The reference SteamPatch uses
  SteamKit for Workshop discovery and DepotDownloader for anonymous UGC
  transfers, followed by installation into the desktop Workshop layout.
- Terraria Workshop items use app ID `105600`; tModLoader items use app ID
  `1281930`. Discovery and downloads must retain the selected app ID throughout
  the request and install pipeline.

## User-Facing Behavior

- Provide distinct Terraria and tModLoader Workshop catalogs.
- Terraria catalog filters cover worlds and resource packs. The tModLoader
  catalog exposes the available mod categories and relevant metadata filters,
  such as tModLoader version and language, when returned by Workshop metadata.
- Catalogs support search and the screenshot-inspired sort choices: popular,
  most subscribed, recently updated, and newest. Results show artwork, title,
  author, tags, and available rating/subscription metadata.
- A user can open an item's details and start, cancel, and retry its download
  using the existing launcher task/progress UI.
- After a successful transfer, detect supported content and install it into the
  matching launcher-managed location: Terraria worlds, Terraria resource packs,
  or tModLoader mods. Validate files before installation and avoid overwriting
  unrelated user data. Unsupported or ambiguous payloads fail with an actionable
  message rather than being silently installed.

## Authentication and Transfer

- When a Steam account is connected, Workshop requests use the launcher's
  existing Steam session; do not ask the user to sign in again or persist a
  second copy of credentials for Workshop.
- When no Steam account is connected, attempt anonymous access for public
  Workshop content. If Steam denies access, report that the item requires an
  authenticated account and offer the existing Steam sign-in route.
- Extend the existing managed store host for Workshop discovery and transfer so
  UI requests, progress, cancellation, and session lifecycle stay within the
  established native bridge. Reuse SteamKit2 already shipped by the app. Adapt
  the reference patch's UGC protocol/install behavior only where compatible with
  the Android-hosted .NET runtime; do not copy desktop Steamworks hooks, native
  DLL shims, or desktop Workshop directory assumptions.
- Enforce one active mutating/download task consistently with the current
  launcher task gate. Propagate cancellation to network transfer and temporary
  file cleanup.

## Installation Safety

- Stage downloads in launcher-owned temporary storage, not directly in the
  installed content directories.
- Check item identity/app ID and payload type. For archives, reject traversal,
  links, duplicate/conflicting paths, oversized entries, and invalid checksums
  where available.
- Commit validated files into the destination only after staging succeeds. On
  failure or cancellation, remove only the task's temporary files and preserve
  existing installed content.
- Keep tModLoader's local Workshop metadata/import compatibility behavior
  intact; the launcher remains responsible for acquiring content and tML for
  loading it.

## Scope Boundaries

- In scope: Terraria worlds and resource packs; tModLoader Workshop mods;
  discovery, sorting, filtering, details, transfer, progress/cancellation, and
  automatic type-based installation.
- Out of scope: publishing, rating/favoriting/subscribing, collections with
  recursive dependency installation, non-Workshop stores, and modifying the
  tModLoader desktop Steam integration.
- Anonymous access is best-effort and limited by Steam's per-item access rules;
  the launcher must not represent it as guaranteed for every public listing.

## Verification

- Managed tests cover app-ID routing, query mapping and sorting parameters,
  authenticated-session reuse, anonymous fallback, access-denied reporting,
  cancellation, and duplicate-task protection without real user credentials.
- Installer tests cover each supported payload type, malformed/unsupported
  payloads, path traversal, size limits, interrupted staging, and preservation
  of existing files.
- Android/native bridge tests cover catalog request/response mapping, task
  progress, cancellation, retry, and navigation to the correct installed
  content view.
- Run focused managed, Kotlin, and UI tests, then the repository's available
  broader validation. Validate actual Steam UGC transport compatibility with
  the Android-hosted .NET runtime before claiming end-to-end Workshop support.

## Open Implementation Constraint

The reference patch's `ContentDownloader.DownloadPubfileAsync` performs an
anonymous transfer using its own DepotDownloader session. That does not satisfy
the requested authenticated-session reuse by itself. During implementation,
first verify whether its UGC transfer primitives can consume the launcher's
existing SteamKit session on Android. If not, implement/adapt the transfer
against the existing SteamKit connection or present the concrete platform
constraint for a design adjustment; do not silently start a second credential
session.
