# Renderer APK Plugin Protocol v1

The launcher discovers a renderer APK through Android package visibility and reads a JSON descriptor from its assets. A plugin is an independently installed APK; it is not a `.tpatch` archive and is never bundled into the launcher.

## Discovery service

Declare an exported marker service with the action `dev.tml.mobilelauncher.action.RENDERER_PLUGIN`. The service is only a package-discovery marker. The launcher never starts or binds it. Plugins should not add broad package permissions to the launcher.

```xml
<service
    android:name=".RendererPluginMarkerService"
    android:exported="true">
    <intent-filter>
        <action android:name="dev.tml.mobilelauncher.action.RENDERER_PLUGIN" />
    </intent-filter>
</service>
```

The descriptor must be at `assets/tml-renderer/manifest.json` in the plugin APK. Use this shape:

```json
{
  "protocolVersion": 1,
  "renderers": [{
    "id": "gl4es",
    "displayName": "GL4ES",
    "description": "OpenGL compatibility renderer",
    "backend": "gl4es",
    "minAndroidApi": 28,
    "abis": ["arm64-v8a"],
    "libraries": [
      { "fileName": "libGL_gl4es.so", "assetPath": "tml-renderer/arm64-v8a/libGL_gl4es.so", "sha256": "<64 lowercase hex characters>" },
      { "fileName": "libEGL_gl4es.so", "assetPath": "tml-renderer/arm64-v8a/libEGL_gl4es.so", "sha256": "<64 lowercase hex characters>" }
    ]
  }]
}
```

`id` is unique within the APK and uses lowercase letters, digits, dots, underscores, or hyphens. The stable selection identity is `<packageName>:<id>`. `displayName` is 1-80 characters, `description` is at most 500 characters, `minAndroidApi` must be at least 28, and `abis` must contain supported Android ABI names. Every asset path must remain beneath `tml-renderer/`, include an ABI directory, and avoid empty, `.` or `..` path segments.

## Backend files

The backend field is an allowlisted SDL Android loader name. Every listed backend requires the exact complete file set below; arbitrary library names are rejected.

| Backend | Required asset file names |
| --- | --- |
| `gl4es` | `libGL_gl4es.so`, `libEGL_gl4es.so` |
| `angle` | `libGLESv2_angle.so`, `libEGL_angle.so` |
| `mobileglues` | `libmobileglues.so` |

Put each ABI's native files under `tml-renderer/<abi>/`. The SHA-256 must be the lowercase digest of the exact file bytes. Generate it, for example, with `Get-FileHash -Algorithm SHA256 <file>` in PowerShell. The digest detects damaged or mismatched assets; it does not authenticate the publisher.

The launcher verifies hashes when it discovers a compatible plugin and again while copying the chosen libraries into its private `filesDir/renderers/` directory before game launch. A failed verification, incompatible API/ABI, removed package, or unsupported backend makes that renderer unavailable. Launch then falls back to system OpenGL ES 3.

External native libraries execute inside the game's process with that process's permissions. Installing and selecting a plugin is a trust decision. The launcher does not verify APK publisher identity.

## Minimal Android module layout

```text
src/main/AndroidManifest.xml
src/main/java/<your/package>/RendererPluginMarkerService.kt
src/main/assets/tml-renderer/manifest.json
src/main/assets/tml-renderer/arm64-v8a/libGL_gl4es.so
src/main/assets/tml-renderer/arm64-v8a/libEGL_gl4es.so
```

The service can be an empty `Service` implementation because it is not invoked. Install the built APK separately from the launcher. The launcher settings list displays the plugin package and version alongside its renderer name.
