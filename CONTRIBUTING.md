# Contributing

## Workflow

1. Create a focused feature branch from `master`.
2. Keep the root game project independent from the Android host.
3. Keep Android-specific code under `platforms/android/`.
4. Treat `external/` as pinned submodules. Update a dependency in its own
   repository, then update the gitlink and `THIRD_PARTY_NOTICES.md` here.
5. Use short Conventional Commit messages.

## Required Checks

Run from the repository root before submitting a change:

```powershell
dotnet build FnaTemplate.csproj -c Release
Push-Location platforms/android
.\gradlew.bat clean :app:assembleDebug
Pop-Location
.\platforms\android\scripts\check-apk-assets.ps1 `
  -ApkPath platforms/android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk
```

Changes to JNI, CoreCLR, SDL2, FNA3D, or FAudio must also be checked on an
arm64 Android device with logcat. Clear the app data before testing a changed
managed assembly.

## Repository Hygiene

Do not commit generated `bin/`, `obj/`, Gradle build, CMake build, extracted
game assets, signing files, credentials, or machine-specific paths. Do not
modify external source trees directly in the main repository; use a pinned
submodule commit instead.
