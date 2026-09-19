# tModLoader FNA Android

## Goal

Create a separately managed `tModLoader-FNA-Android` project based on the existing FNA Android CoreCLR template. It keeps upstream Windows, Linux, and macOS support, adds an explicit Android platform, downloads only user-owned Terraria content through Steam, and runs tModLoader plus in-process Roslyn mod compilation on Android CoreCLR.

## Current Phase

Design approved by the user; written spec is being prepared for review.

## Phases

1. [in_progress] Record and self-review the Android port design.
2. [pending] User review of the written spec.
3. [pending] Write the implementation plan.
4. [pending] Create the isolated tModLoader project/worktree.
5. [pending] Add upstream tModLoader source linkage and Android patch layer.
6. [pending] Implement Android platform services and CoreCLR bootstrap.
7. [pending] Implement Steam login, ownership validation, and resumable content download.
8. [pending] Build the Android APK and run host-side checks.
9. [pending] Run device verification where an arm64 Android device is available.

## Constraints

- Do not modify `D:/tModLoader`.
- Do not commit Terraria commercial content, credentials, tokens, or downloaded manifests.
- Keep tModLoader's managed target at `net8.0`; run it on the .NET 10 CoreCLR runtime supplied by the Android template.
- Preserve Windows, Linux, and macOS builds.
- Android first target is arm64-v8a and API 28+.

## Errors

| Error | Attempts | Resolution |
|---|---:|---|
| Confidence skill path mismatch | 1 | Located the actual directory as `C:/Users/Administrator/.codex/skills/confidence-check` and read it. |

