# Findings

## Existing repositories

- `D:/FNA Android` is the FNA-ANDROID Git repository. Its remote is `https://github.com/FireworkSky/FNA-ANDROID.git`.
- `D:/FNA Android/.worktrees/fna-android-coreclr` is an existing clean linked worktree on `feat/fna-android-coreclr`, currently at `387e3c3`.
- `D:/tModLoader` is an independent checkout on `stable` at `d30c844159`; it must remain untouched.
- `D:/StS2-Launcher-main` is a readable reference for SteamKit2 login, Steam Guard, PICS/depot access, CDN download, and Android Keystore credential protection.

## tModLoader constraints

- The main projects are `src/tModLoader/Terraria/Terraria.csproj` and `src/tModLoader/ReLogic/ReLogic.csproj`.
- The game currently targets `net8.0` and references FNA, ReLogic, Steamworks.NET, registry support, desktop helpers, and native libraries.
- Platform detection is in `src/TerrariaNetCore/ReLogic/OS/Platform.cs` and `PlatformType.cs`; unknown platforms currently fall back to Linux.
- Launch and native path logic is in the Terraria launch code and must gain an explicit Android branch.
- Mod compilation already uses Roslyn `CSharpCompilation`, but desktop code may invoke an external `dotnet` SDK. Android needs an in-process path.
- Desktop build targets copy output to a Steam installation directory and must be disabled or redirected for Android packaging.

## Approved architecture

- New project name: `tModLoader-FNA-Android`.
- Use the FNA Android CoreCLR template as the host baseline.
- Link a pinned tModLoader upstream revision as a Git submodule or equivalent source input; keep Android changes in `patches/android/`, `src/android/`, and `platforms/android/`.
- Add `PlatformType.Android` and `AndroidPlatform`; do not identify Android as Linux.
- Initialize CoreCLR once in `TmlAndroidBootstrap.dll`, authenticate/download first, then load and invoke `tModLoader.dll` in the same process.
- Authenticate with Steam account/password and Steam Guard, validate Terraria ownership for App ID `105600`, and download legal content through Steam CDN/depot manifests. tModLoader App ID `1281930` is available for ownership/update checks where needed.
- Persist only encrypted refresh-token/GuardData material in Android Keystore-backed storage. Never persist or log passwords, tokens, tickets, or CDN credentials.

## Required runtime services

- Android clipboard and path services.
- Android window/fullscreen/orientation handling.
- Android IME/text-input bridge.
- Permission and event-queue integration through the existing SDL/FNA Android host where possible.
- Android-safe file and URL launching behavior with explicit unsupported-operation results instead of desktop process launches.

