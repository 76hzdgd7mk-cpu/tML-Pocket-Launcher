# tModLoader FNA Android Design

## Status

Design approved in conversation and written for user review. Implementation starts only after this document is reviewed and the implementation plan is written.

## Goal

Create a separately managed project named `tModLoader-FNA-Android` that uses the existing FNA Android CoreCLR template to build and run tModLoader on Android. The project retains upstream Windows, Linux, and macOS support, adds Android as an explicit platform, authenticates to Steam on the device, verifies ownership, downloads the user's legal Terraria content, and launches tModLoader in the same .NET 10 CoreCLR process used by the bootstrap.

The project is a porting and packaging layer. It does not redistribute Terraria commercial content, Steam credentials, Steam tickets, or downloaded depot data.

## Scope and non-goals

In scope:

- An Android arm64-v8a API 28+ application based on the FNA Android CoreCLR template.
- A pinned upstream tModLoader source input, with Android changes isolated in a patch layer.
- Explicit `PlatformType.Android` and Android implementations for path, clipboard, window, orientation, IME, and supported input/event behavior.
- One CoreCLR initialization per Android process.
- Steam account/password plus Steam Guard authentication.
- Terraria ownership validation, resumable depot download, integrity checks, and local content validation.
- In-process Roslyn mod compilation that does not start a desktop `dotnet` SDK process.
- Build, packaging, host-side validation, and device verification documentation.

Out of scope for the first implementation:

- Modifying or vendoring the original `D:/tModLoader` checkout.
- Redistributing Terraria or tModLoader commercial assets.
- Supporting x86, x86_64, or armeabi-v7a Android ABIs.
- A general multi-game launcher or arbitrary file-picker UI.
- Release signing, Play Store publication, or Steam account recovery.
- NativeAOT or a second managed runtime.
- Pretending Android is Linux to reuse platform detection.

## Repository and source layout

The new project is created separately from the existing FNA template worktree. Its source layout is:

```text
tModLoader-FNA-Android/
  app/                         Android application and assets
  native/                      SDL/FNA/CoreCLR JNI host integration
  sample/                      temporary FNA smoke-test game used before tModLoader packaging
  third_party/
    FNA/                       pinned FNA source or reference consumed by the host
    tModLoader/                pinned upstream tModLoader submodule
    SteamKit2/                 package reference, not copied source
  src/
    android/
      TmlAndroidBootstrap/     Steam, extraction, process, and tModLoader entrypoint
  platforms/
    android/                   Android-specific tModLoader adapters and build props
  patches/
    android/                   small, reviewable upstream patch files
  scripts/                     repeatable source, content, and APK validation scripts
  docs/                        porting, runtime, legal-content, and troubleshooting docs
  docs/superpowers/specs/      approved design and implementation records
  docs/superpowers/plans/      implementation plan
```

The upstream source is pinned to a commit and updated deliberately. Android patches must be small enough to review independently and must not be silently applied to desktop builds. Build outputs, extracted runtime files, Steam manifests, credentials, and user content are ignored.

## Runtime architecture

```text
Android Activity
  -> SDL/FNA native host
  -> TmlAndroidBootstrap.dll
       -> SteamKit2 login + Steam Guard
       -> ownership check for Terraria 105600
       -> resumable Steam CDN depot download
       -> content validation and path setup
       -> load tModLoader.dll in the same CoreCLR process
  -> tModLoader / ReLogic / FNA
  -> SDL2 + FNA3D + FAudio
```

The bootstrap is the only component allowed to initialize CoreCLR. It exposes a narrow managed entrypoint to the Android JNI host. After resource preparation succeeds, it loads the tModLoader assembly through `AssemblyLoadContext` or the host's established assembly-loading boundary and invokes the normal managed entrypoint without spawning another process. A process restart is required after Activity/process death; CoreCLR is never initialized twice in one process.

tModLoader remains targeted at `net8.0` to limit upstream churn. The Android package supplies .NET 10 CoreCLR and its compatible runtime configuration. This is a hosting choice, not a retargeting of the tModLoader source to `net10.0`.

## Steam and social API boundary

SteamKit2 is used for Android authentication, ownership, depot metadata, CDN access, and the minimum account/workshop operations that can be represented without Steam's desktop native client. The existing `Steamworks.NET.AnyCPU` reference and native `steam_api` loading path are retained for Windows, Linux, and macOS only. Android build properties must exclude those desktop references and select an Android social implementation that reports unsupported native-client operations explicitly.

The Android social implementation still exposes the tModLoader contracts needed to start the game, identify the authenticated user when SteamKit2 can provide it, and read content that has already been downloaded. Features requiring the desktop Steam client, such as native overlay, achievements callbacks, rich presence, client-mediated workshop publishing, and Steam cloud synchronization, are either mapped to a SteamKit2-backed implementation with tests or disabled with a visible unsupported result. They must not call `SteamAPI.Init`, `RestartAppIfNecessary`, desktop `steamcmd`, or `Process.Start` on Android.

## Android platform boundary

The platform layer adds `Android` to the existing platform enum and selects `AndroidPlatform` before the Linux fallback. The adapter owns Android-specific behavior:

- `PathService`: app-private files directory, cache directory, content root, and writable mod/config paths.
- `ClipboardService`: Android clipboard access through the Activity bridge.
- `WindowService`: fullscreen, orientation, display metrics, safe surface lifecycle, and back handling.
- `ImeService`: SDL/Android text-input bridge and keyboard visibility requests.
- `Process/URL/File` operations: supported Android intents only; unsupported desktop operations return a structured failure and log a reason.
- Input and event queue: SDL remains the input source. Android touch, key, back, text, focus, and lifecycle events are converted into the SDL/FNA event path already used by the FNA host.

No Android code is compiled into desktop targets unless guarded by the Android build property or platform conditional. Existing Windows, Linux, and macOS platform implementations remain the default for their respective operating systems.

## Steam authentication and content flow

The Android bootstrap uses SteamKit2 APIs already proven by `D:/StS2-Launcher-main`:

1. Inspect local content and a versioned download state file.
2. Prompt for Steam username and password in the Android UI. Password is held only in memory for the login attempt.
3. Handle Steam Guard email/mobile-code callbacks and remember only the minimum encrypted guard/session data needed for later login.
4. Establish a Steam session and validate Terraria ownership using App ID `105600`. The tModLoader App ID `1281930` may be checked separately when the requested build requires it.
5. Resolve the required depot/manifest and download files via Steam CDN with bounded concurrency, retry, cancellation, resume, and per-file hash/size validation.
6. Write to a staging directory, validate the expected Terraria content layout, atomically promote the completed directory, and record a non-secret state manifest.
7. Configure tModLoader content paths and start the game in-process.

SteamKit2 API calls are isolated behind interfaces so tests can use deterministic fakes. The implementation must not bypass Steam ownership, scrape unauthenticated download URLs, or accept arbitrary local content as a substitute for the ownership check in the normal flow.

## Credential and logging policy

- Never save the Steam password.
- Store refresh-token and GuardData material only when SteamKit2 requires it, encrypted with an Android Keystore AES-GCM key.
- Include key versioning and a clear-credentials operation. Keystore invalidation causes a clean re-login rather than a fallback to plaintext.
- Do not log passwords, access/refresh tokens, Steam tickets, CDN tokens, cookies, or full authentication payloads.
- Log only stage, app/depot identifiers, byte counts, retry category, and sanitized error codes.
- Keep commercial content outside Git, source archives, APK source assets, and CI artifacts. The APK contains code and runtime only; content is extracted into app-private storage after user authentication.

## Mod compilation

tModLoader's existing Roslyn compilation path is retained, but the Android build must avoid launching `dotnet`, opening desktop editors, or relying on an installed SDK. The Android branch supplies runtime assembly references from the loaded tModLoader/FNA/runtime locations and invokes `CSharpCompilation.Emit` in-process. Compilation output is written to app-private mod build directories, with cancellation and diagnostics returned through the existing tModLoader UI/logging path. Desktop compilation behavior remains unchanged.

The Android patch also identifies desktop-only operations at build time or through `PlatformType.Android`: registry access, shell/file-manager launching, updater self-replacement, native RGB support, external Steam client operations, and desktop file dialogs. Each is removed from the Android dependency graph or replaced with an Android-safe adapter; no catch-all Linux fallback is allowed for these operations.

## Build and packaging

The project consumes the existing FNA Android host conventions:

- Gradle/Android plugin builds the Kotlin Activity, SDL support, JNI host, SDL2, FNA3D, and FAudio for arm64-v8a.
- A pinned .NET 10 runtime archive is packaged as an application input and extracted to app-private storage on first launch.
- tModLoader and its managed dependencies are published as IL assemblies and copied into the game asset set or generated staging directory; no NativeAOT is used.
- Android-specific MSBuild properties disable desktop Steam-directory copy targets and direct output into the Gradle staging path.
- A manifest records assembly name, tModLoader revision, runtime version, content schema version, and native ABI. It contains no account or content secrets.

Required validation checks include managed build, Android native build, APK asset listing, absence of commercial content in tracked files, and `git diff --check`. A physical arm64 device is required to claim CoreCLR initialization, Steam login, content download, rendering, and input success.

## Error handling and lifecycle

Each stage returns a typed or stage-tagged error: authentication, ownership, manifest resolution, download, validation, extraction, native loading, CoreCLR startup, tModLoader startup, or mod compilation. User-facing messages are short and actionable; logcat contains the sanitized diagnostic and correlation stage.

Downloads use staging plus atomic promotion. A failed or cancelled download leaves resumable state but never marks the content complete. Runtime extraction follows the same temporary-directory rule. Activity recreation does not reinitialize CoreCLR; the game process is terminated and relaunched when the native host lifecycle requires it.

## Testing strategy

- Unit tests for path selection, manifest schema, state transitions, Steam credential storage, download resume/hash validation, and platform selection.
- Fake SteamKit2 integration tests for login callbacks, Steam Guard, ownership failure, manifest failure, retry, cancellation, and successful promotion.
- Host-side build tests for desktop targets and Android staging, including a check that Android conditionals do not alter Windows/Linux/macOS builds.
- APK checks for ABI, JNI/native libraries, runtime archive, managed assemblies, and absence of Terraria content.
- Device checks on arm64 Android API 28+: first launch, login/Guard flow, download resume, rendering, touch/key/text/back events, orientation, IME, permissions, mod compilation, and clean relaunch.

## Acceptance criteria

The project is complete when:

1. A clean checkout can build the Android APK from documented prerequisites without editing `D:/tModLoader`.
2. Windows, Linux, and macOS build paths remain available and their platform selection is unchanged.
3. Android reports `PlatformType.Android` and uses Android-specific services.
4. Steam ownership is verified before Terraria content is downloaded, and no secret or commercial content is committed.
5. CoreCLR is initialized once and invokes tModLoader in-process after content preparation.
6. The net8.0 tModLoader assembly starts on the packaged .NET 10 CoreCLR runtime, or any remaining incompatibility is recorded with an exact blocking diagnostic rather than presented as success.
7. Host-side automated checks pass; device results are reported separately with fresh evidence.
