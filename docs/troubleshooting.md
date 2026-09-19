# Troubleshooting

## The build cannot find generated tModLoader source

Ensure `D:\tModLoader\src\WorkspaceInfo.targets` exists, or pass an explicit
source root to `platforms/android/scripts/prepare-game.ps1` with
`-GeneratedSourceRoot`.

## Gradle is slow or dependency downloads time out

The build honors `HTTP_PROXY` and `HTTPS_PROXY`. For the local proxy used in
this workspace:

```powershell
$env:HTTP_PROXY = 'http://127.0.0.1:7890'
$env:HTTPS_PROXY = 'http://127.0.0.1:7890'
```

## The app asks for Steam login again

The refresh token may have expired or been revoked, or the Android Keystore
entry may have been invalidated. Complete login again. `adb shell pm clear`
also deliberately removes the encrypted session and downloaded content.

## Content download fails

Confirm network access, Steam Guard completion, and Terraria ownership for App
ID `105600`. Check `adb logcat -s FnaAndroidCoreClr SDL`. Do not copy a desktop
Steam directory into the APK or commit Terraria files as a workaround.

## The app starts but rendering or input fails

Use an arm64-v8a API 28+ device or emulator. Capture fresh logs and verify the
native libraries are present with `check-apk-assets.ps1`. A successful Gradle
build does not prove device CoreCLR startup or GPU compatibility.
