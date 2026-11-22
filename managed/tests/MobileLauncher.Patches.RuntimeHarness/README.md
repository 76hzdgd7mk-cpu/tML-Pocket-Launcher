# Real-assembly patch and touch regression harness

FrameRegression.cs is adapted from RotatingartLauncher/patches/TModLoaderFrameRatePatch/tests/RuntimeHarness/Program.cs (GPL-3.0; full license in ../../../external/tML-Pocket-Patches/LICENSE). It exercises the migrated production patch with the actual precompiled game's accumulator and reload/rollback paths; unrelated native content/device operations are replaced in the fixture.

TouchRegression.cs is adapted from MobileJoystick's input regressions by yu. It loads the embedded patch and real game input types, verifies hook installation and embedded resources, and runs synthetic touch input. Optional InnoVault verification runs when MJ_INNOVAULT_DLL is set explicitly.

Run scripts/checks/check-patch-runtime.ps1. Native Windows game dependencies must be present in the reference release. Results establish behavior for that reference build and synthetic input, not hardware multitouch, multiplayer or sustained 120 FPS.
