# Steam/GOG resource integration and immersive launcher

The existing approved account controls now connect to native store operations.
Steam uses SteamKit2, and GOG follows the official OAuth and Linux installer
approach inspected in `D:/RotatingartLauncher`. Reference files are not modified.

- Hide status/navigation bars in MainActivity on create/resume/focus; retain
  transient system swipe navigation and restore fullscreen after external UI.
- Package a separate managed store executable alongside the game host. Run it
  once on a background thread in the launcher process; keep game CoreCLR in
  `:game`. Authenticate its IPv4-loopback RPC with a per-process random secret.
- Implement Steam password/refresh authentication, email/Guard/mobile approval,
  ownership checks, public Linux manifests and verified content chunks.
- Implement isolated GOG official authorization, token refresh, library checks,
  installer choice, download and makeself/ZIP data extraction with CRC checks.
- Encrypt refresh tokens with Android Keystore; never persist passwords or codes,
  send tokens to the React UI, or log authentication URLs/bodies.
- Pass downloaded Content ZIPs through the existing transactional installer;
  retain user data, respect Wi-Fi-only and running-game guards, report progress
  and support cancellation without claiming resumable downloads.
- Validate managed extraction/hash failure tests, native bridge UI workflows,
  Android compilation/unit tests/APK contents, host startup and official auth
  opening on the connected phone. Complete owned-account transfers require a
  real account and remain explicitly unvalidated.
