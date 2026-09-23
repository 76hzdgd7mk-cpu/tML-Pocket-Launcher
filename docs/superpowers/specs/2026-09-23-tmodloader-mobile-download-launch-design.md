# tModLoader Mobile Download and Launch UI

## Status

Approved design. Ready for implementation planning.

## Goal

Design and implement two connected Android surfaces for tModLoader Mobile:

1. A Steam-style download and installation center that clearly communicates content preparation.
2. A Steam large-screen-style game launch surface shown after content is installed.

The experience is landscape-first, edge-to-edge, controller-friendly, and compatible with the existing .NET 10 CoreCLR host.

## Approved visual direction

The download screen uses the approved A direction: a left tModLoader identity rail and a right status workspace. The workspace shows the current operation, progress, transfer rate, downloaded/total size, storage capacity, and the current installation stage.

The launch screen uses the approved B direction: a large tModLoader visual area on the left and a compact library/status panel on the right. The panel shows the installed version, Steam connection, content verification, storage usage, and the primary `Launch tModLoader` action.

The existing tModLoader gear-tree artwork and teal/dark palette remain the visual identity. The UI uses full-screen layouts with no system bars, no decorative black side gutters, and minimum 48dp touch targets.

## State model

The Android presentation layer renders a small state model rather than interpreting arbitrary log text:

- `Checking`: inspect local content and available storage.
- `Authenticating`: Steam login or session restoration is in progress.
- `Downloading`: Steam depot content is transferring; expose percent, bytes, speed, and current file/stage.
- `Installing`: downloaded files are being extracted, verified, or finalized.
- `Ready`: content is installed and verified; render the launch screen.
- `Launching`: the CoreCLR game host is starting; render startup stage and progress.
- `Paused`: preserve progress and offer resume.
- `Failed`: show a safe user-facing error, preserve retry context, and offer retry or return to login.

Existing Steam account, password, and Steam Guard prompts stay on the current event queue. No credential or token is copied into Android view state or log output.

## Data flow

The existing C# `IAndroidBridge.SetStartupStatus(title, detail, progressPercent)` remains the cross-runtime status boundary. The Android bridge maps status updates to the download/install view model:

```text
Steam/content preparation
        -> IAndroidBridge status callback
        -> native Android bridge
        -> GameActivity UI state reducer
        -> download/install or launch surface
```

The current callback remains backward compatible for generic startup messages. Where more detail is needed, the title and detail fields use stable prefixes and parseable progress values rather than exposing exceptions directly. The UI must tolerate unknown titles and `-1` indeterminate progress.

The launch action calls the existing game host entry point. It does not create another process or introduce a second runtime. While launching, the surface remains visible until the game takes over or a failure is reported.

## Interaction behavior

- Initial launch never focuses an editable field and never opens the IME.
- Download controls use clear text plus state, with `Pause`, `Resume`, `Retry`, and `Cancel` enabled only when valid.
- The primary action is always visually distinct and has a content description.
- Back/cancel behavior is routed through the existing Android event queue; it must not silently discard a partial download.
- A retry reuses resumable download state and does not clear valid files.
- Ready state exposes one primary launch action and a secondary content-management/recheck action only if the existing backend supports it.
- Error messages are concise in the main panel. Technical detail is logged through the existing diagnostic path and is not rendered with credentials, refresh tokens, or guard data.

## Component boundaries

- `GameActivity`: owns full-screen window policy and routes state changes/actions to the visible surface.
- `DownloadInstallOverlay`: renders Checking, Authenticating, Downloading, Installing, Paused, and Failed states.
- `GameLaunchOverlay`: renders Ready and Launching states.
- `AndroidBridge`/native bridge: transports status and action events without owning layout.
- `TmlAndroidHost` and `SteamContentPreparation`: remain the source of truth for authentication, download, verification, and launch operations.

The new overlays must not duplicate Steam protocol logic or directly access credentials. They should be ordinary Android views, kept separate from SDL/FNA rendering so the game surface can take over cleanly.

## Error and lifecycle handling

- Overlay updates are posted to the main thread.
- Updates received after `onDestroy` are ignored.
- Repeated status updates do not add duplicate views.
- Hiding an overlay releases its input focus and removes it from the activity view tree.
- Window focus restoration reapplies immersive mode.
- If the host fails before a structured state is available, render the existing startup failure dialog with a sanitized detail string.

## Acceptance criteria

- The APK builds with `:app:assembleDebug`.
- On a connected landscape device, no IME appears at startup and the window fills the complete display.
- Download state can display determinate and indeterminate progress without clipping at 1080px landscape height.
- Pause/resume/retry controls are visually and functionally gated by state.
- Ready state shows tModLoader identity, version `1.4.4.9`, Steam status, content status, and launch action.
- Launching state remains visible until the game surface is ready or an error is shown.
- Existing Steam authentication and content tests remain passing.
- No account, password, Steam Guard code, refresh token, or guard data is rendered or logged by the new UI.
