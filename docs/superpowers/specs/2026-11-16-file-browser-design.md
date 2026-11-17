# Launcher file browser

Replace Android document picking for production imports, backgrounds and JSON
exports with a reusable launcher file browser. Keep the existing installer and
Steam/GOG provenance rules.

## Interaction and space

Use a full-screen Animate UI dialog with a 44px header. Show the format next to
the title. Put storage selection, breadcrumbs, search, sort and refresh into one
compact toolbar on landscape phones and two rows on narrow phones. Keep directory
contents flexible and scrollable, with confirmation pinned to the bottom. There
is no permanent sidebar. Explanatory text and absolute paths appear only through
the storage-info button. Show pagination only for directories over 100 entries.

Support directories, parent and breadcrumb navigation, Download/Documents
shortcuts through the location menu, search in the current directory, name/date/
size sorting, filename/size/date display and selection. Mods allow up to 100
selections across directories; other imports select one file. Export selects a
directory and a JSON filename and refuses to overwrite existing files. Errors
remain in the browser, retaining selections for retry. Native import progress and
cancellation use the existing task system.

## Boundaries

`feature/files/FileBrowserRepository` handles paths, listing, format selection and
exclusive JSON creation without Activity dependencies. `FileBrowserAccess` owns
Android storage roots, permission state and bounded image decoding. The existing
controller uses a dedicated file worker so browsing never blocks the UI thread.
`features/native/files.tsx` provides reusable browsing/import/export controls.

Only explicitly registered roots can be read: app-owned external Documents,
primary shared storage after permission and removable volumes after permission.
Internal launcher files and credentials are not roots. Reject traversal, symbolic
links, unknown roots and shared Android/data, Android/obb and Android/sandbox.
Revalidate selections natively before import, independently of UI filtering.
Backgrounds accept PNG/JPEG/WebP up to 10 MB and are decoded/downsampled to a
bounded raster. Exports use CREATE_NEW and a 200 KB UTF-8 limit.

Android 11+ requires MANAGE_EXTERNAL_STORAGE via the system's permission page;
older supported versions request read/write permissions. These are permission
flows, not file pickers. Denial retains the app-owned external root and an inline
authorization entry. Returning from permissions refreshes available roots. Native
WebView file upload, OPEN_DOCUMENT and CREATE_DOCUMENT paths are removed. Browser
preview uploads continue to use browser facilities.

## Verification

JVM tests cover filtering, sorting/pagination, roots/permissions, traversal,
protected directories, symlinks, selection formats/count/duplicates/deletion and
export collision/path/size checks. Browser fixtures cover six phone sizes,
directory navigation, search, denied/restored permissions, multiselect/cancel,
both Terraria formats, export retry and background import. Layout assertions
require the file list to occupy at least half the viewport on the tested sizes.
Device checks use a uniquely named empty mod-pack JSON, validate export/import,
then remove only those temporary artifacts. Do not change account sessions or
install/launch game resources during these checks.
