# Real-assembly patch and touch regression harness

FrameRegression.cs is adapted from RotatingartLauncher/patches/TModLoaderFrameRatePatch/tests/RuntimeHarness/Program.cs (GPL-3.0; full license in ../../MobileLauncher.Patches/LICENSE). It exercises the migrated production patch with the actual precompiled game's accumulator and reload/rollback paths; unrelated native content/device operations are replaced in the fixture.

TouchRegression.cs is adapted from the supplied MobileJoystick/tools/input-regressions/Program.cs (author yu; provenance in ../../mods/MobileJoystick/UPSTREAM.md), plus a two-contact move/aim/release case. It loads the compiled mod and real game input types, without loading a world or touching normal user data. Optional InnoVault verification runs only if MJ_INNOVAULT_DLL is explicitly set.

Run scripts/checks/check-patch-runtime.ps1. Native Windows game dependencies must be present in the reference release. Results establish behavior for that reference build and synthetic input, not hardware multitouch, multiplayer or sustained 120 FPS.
