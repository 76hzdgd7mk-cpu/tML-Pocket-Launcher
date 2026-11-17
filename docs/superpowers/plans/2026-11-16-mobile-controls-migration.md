# MobileJoystick and tML patch integration

User scope: remove the launcher's native virtual joystick, embed the supplied MobileJoystick client mod as the game touch system, and migrate tML-related RotatingartLauncher patches. Preserve imported tML/FNA packages, accounts, mods and saves. Work in this checkout without committing unrelated changes.

Architecture: curated mod sources live under managed/mods/MobileJoystick. Build against precompiled tML references, package a tmod using the existing release tools and isolated build user data. Bundle it as launcher-owned content, install atomically and merge its enabled state without removing other mods. Back up a differing existing copy. The native SDL surface forwards all contacts directly; a migrated managed adapter handles FNA polling and desktop menu pointers until the mod takes over. No second Android joystick is drawn.

Migrate touch, fullscreen/scaling, frame pacing, FPS reporting, console compatibility and in-process hosting into MobileLauncher.Patches, preserving upstream attribution and GPL text. Existing bootstrap adapters retain ownership of resource validation, logging, URL/IME/clipboard and offline Workshop setup. Do not install overlapping base patches. Load only the APK's known patch assembly, with required and optional features listed in the existing patch page. Optional 120 FPS, FPS display and hosting are disabled initially; render scale defaults to 100%. No server starts just because a patch is installed.

- [x] Stage precompiled game references locally and copy only needed mod sources/assets and migrated patch sources with provenance.
- [x] Add reproducible mod and patch builds; never compile tML or FNA.
- [x] Add bundled-mod installation, backup/update policy and pinned mod management.
- [x] Replace native joystick and duplicate mouse adapter with one FNA touch route; retain Android lifecycle/IME events.
- [x] Wire built-in patch selection, required features, optional toggles and rendering settings through native state and game startup.
- [x] Test installation/update/pack preservation, patch configuration, rapid and simultaneous input, game startup/reload and relevant runtime harnesses.
- [x] Run formatting, TypeScript/browser workflows, managed/JVM tests and APK checks. Install an update and verify menus and actual mod input on-device with fresh logs. Report any unverified in-world or multiplayer behavior accurately.

## Completed validation

Final build: 0.1.10 / 1040420. `scripts/checks/verify.ps1 -Assemble` passed: layout, managed build/format, Bootstrap 15 and Stores 42 tests, real-assembly frame harness 53 assertions plus 23 MobileJoystick input scenarios, runtime/APK checks and Gradle tests/build. Android JVM suite: 69 tests, zero failures, two existing Windows symlink skips. Seven browser suites passed; the updated native fixture additionally verifies pinned MobileJoystick controls, required/optional patch rows and persistent render-scale settings. Source/test Prettier check passed.

The update was installed in place on the connected arm64 phone. A fresh launch with imported tML 2026.09.3.1 and GOG Terraria resources completed mod loading, installed the MobileJoystick hooks and signaled a successful first frame. No startup failure, missing native dependency or unsupported hook signature appeared in that session. Screenshot: ignored build/ui-previews/startup-fixed-menu.png. Earlier device touch samples reached the mod's mobile settings screen. Final polling logs confirm the 1 kHz cap instead of unbounded work in FNA's wait loop. The original mod's 346 copied source/resource files match the supplied directory byte for byte; its added project/provenance files are launcher-owned.

Verification limits: synthetic two-contact input and frame timing are covered by the real-assembly harness; no test world was created, no sustained on-device 120 FPS was measured, and real multiplayer clients/hosting have not been exercised. Hosting and high frame rate remain opt-in; these limits are recorded in the architecture and Android launcher documentation. The migrated base functionality reuses existing Bootstrap adapters. The upstream console stdin/infinite-wait behavior was excluded because this launcher does not own an stdin transport.
