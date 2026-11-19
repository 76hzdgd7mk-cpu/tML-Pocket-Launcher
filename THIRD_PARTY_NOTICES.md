# Third-party components

Preserve upstream copyright, license and notice files when distributing this project.

| Component | Location/source | Role |
| --- | --- | --- |
| SDL2 | `external/SDL`, RotatingArtDev/SDL | Android rendering/input host |
| FNA3D | `external/FNA3D`, RotatingArtDev/FNA3D | Android graphics backend |
| FAudio | `external/FAudio`, RotatingArtDev/FAudio | Android audio backend |
| dotnethost | `android/native/dotnethost` | hostfxr adapter |
| .NET runtime | `android/app/src/main/assets/runtime/dotnet.tar.xz`, version 10.0.4 | Android arm64 CoreCLR |
| MonoMod and Mono.Cecil | `external/monomod` | Prebuilt Android runtime patch dependencies |
| Apache Commons Compress | Gradle version catalog | Archive reading and validation |
| XZ for Java | Gradle version catalog | Runtime archive extraction |
| AndroidX WebKit | Gradle version catalog | Offline asset hosting and origin-scoped WebView messaging; Apache 2.0 |
| SteamKit2 3.5.0 | [SteamRE/SteamKit](https://github.com/SteamRE/SteamKit/tree/3.5.0), NuGet | Managed Steam authentication and content transport; LGPL-2.1-only; unmodified dynamically loaded assembly |
| System.IO.Hashing | NuGet, .NET runtime libraries | GOG resource ZIP CRC verification; MIT |
| protobuf-net / ZstdSharp.Port | SteamKit2 NuGet dependencies | Steam protocol serialization / content decompression; upstream package licenses apply |
| React / React DOM | `ui/launcher/package-lock.json` | Web UI rendering; MIT |
| Motion | `ui/launcher/package-lock.json` | Web interaction and animation; MIT |
| Radix UI | `ui/launcher/package-lock.json` | Accessible Web controls; MIT |
| Animate UI 2.4.5 | [Animate UI](https://animate-ui.com/docs), `ui/launcher/public/animate-ui-license.txt` | Animated Web primitives; MIT + Commons Clause |
| Inspira UI LiquidGlass | [Upstream source](https://github.com/unovue/inspira-ui/blob/main/app/components/inspira/ui/liquid-glass/LiquidGlass.vue), `ui/launcher/public/inspira-ui-license.txt` | Legacy SVG backdrop-refraction notice retained with the Web assets; the current control lens is a WebGL reimplementation; MIT |
| Lucide icons | [Lucide](https://lucide.dev), `ui/launcher/public/lucide-license.txt` | Menu, LayoutTemplate, Cog and Settings from Animate UI's official icon registry, Wallpaper from Lucide; ISC/MIT |

The Animate UI launcher workspace consumes the official `@animate-ui/react` package.
Its copyright and full MIT + Commons Clause notice accompany the built Web assets
as `animate-ui-license.txt`. The components are integrated into the launcher UI;
they are not offered as a standalone component bundle. Gradle embeds these built
assets and accompanying notices into the Android application under `assets/ui`.

Android MonoMod binaries were already present in this checkout's previous launcher output and were preserved during restructuring. Their original source is RotatingArtLauncher's MonoMod archive (`sha256:690aa28beee8a877d40af5d344f13e8c5d3b1e3fe1737027418058db68018c7c`). The launcher prioritizes these Android detour libraries over desktop versions shipped in an imported game. Record any future replacement source and digest here.

tModLoader, managed FNA and Terraria Content are supplied by user-selected release/resource packages. They are not compiled or bundled by the launcher build.

tML-specific patches from the user-supplied `D:\RotatingartLauncher\patches` are adapted in the external [tML-Pocket-Patches](https://github.com/FireworkSky/tML-Pocket-Patches) project: touch input, fullscreen presentation, render scale, frame pacing, FPS measurement, console compatibility and integrated hosting. The upstream GPL-3.0 text is retained in that repository and distributed in the APK as `launcher/RotatingartLauncher-LICENSE.txt`. See its README for versions, changes and exclusions. The source project remains unchanged.

MobileJoystick 0.1.4, author **yu**, was supplied from the user's `Terraria/tModLoader/ModSources/MobileJoystick` directory. Its curated source, localization and assets are maintained in the external [tML-Pocket-Mods](https://github.com/FireworkSky/tML-Pocket-Mods) project under `MobileJoystick/`; the build embeds only the client `.tmod`. Original asset notices, including `Assets/**/SOURCE.txt`, are retained. No mod license file was present in the supplied source; this notice does not assign it a new license. The Android build uses .NET 10 reference assemblies to match the launcher's existing Android runtime and MonoMod dependencies. See `MobileJoystick/UPSTREAM.md` in that repository.
