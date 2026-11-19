# Troubleshooting

## Gradle dependency downloads fail

Check the first failing repository URL and the JDK trust store or local proxy configuration. Configure Gradle proxy properties locally when needed; never commit proxy credentials. Retry after connectivity is restored. Use `--offline` only when all required artifacts are already cached.

For the Windows `PipeImpl` / `UnixDomainSockets.connect` failure before Gradle configuration, see [development](development.md#windows-java-socket-issue).

## A resource package is rejected

Import a ZIP containing Terraria's `Content` directory, or the resource tree with its `Images` directory at the root. The launcher also accepts a nested installation directory. Keep the original directory structure. Saves and mods are not resource packages.

For tML, use the official `tModLoader.zip` release asset or the in-app version downloader. The package must contain its DLL, dependency manifest, runtime configuration, FNA and Content. A source archive or a single DLL is insufficient. An unsuccessful or cancelled replacement preserves the previous validated package.

## Official versions cannot be downloaded

Check access to GitHub Releases and its asset download hosts. GitHub may temporarily rate-limit release listing. Retry later or import the same official release ZIP through the launcher's built-in file browser. A download size or checksum error requires a fresh download.

## The game fails after launch

Capture fresh logs with `adb logcat -v time MobileLauncher:I FnaAndroidCoreClr:I FnaAndroidNative:I FnaAndroidStatus:I RendererPlugins:I SDL:I TmlAndroidIme:I libc:F DEBUG:F AndroidRuntime:E "*:S"`. Start capture before opening the launcher or launching the game. `MobileLauncher` records the launcher lifecycle, UI loading, operation results and launch stages. `FnaAndroidCoreClr` includes managed console output (Info) and errors (Error), which also remain in `dotnet-runtime.log`. `FnaAndroidNative` forwards native stdout/stderr after the launcher's native library loads. Launcher operation logs omit request parameters, response data and exception messages.

The launcher uses `com.example.fnatemplate`; the game runs separately as `com.example.fnatemplate:game`. Filtering by only the launcher's PID hides game/runtime messages. Capture by the tags above across both processes. Check the selected tML version, imported Terraria resources and available storage. Saves and mods are stored separately under `userdata`; app data clearing removes them and should not be a routine troubleshooting step.

When the game process dies, returning to the launcher (or reopening it if the system also killed it) shows a selectable crash report with a copy button. The journal starts before loading SDL/FNA3D and records the last component/startup stage, tML version, renderer, Java exceptions and the application's logcat tail. Reports live in `userdata/Logs/game-crashes/<session>/report.log` and are included by the launcher's existing Logs view. The latest five sessions are retained; each session keeps up to two 512 KiB logcat files and a system exit trace capped at 4 MiB.

On Android 11+, `ApplicationExitInfo` supplies the exit reason/status when available. Android 12+ may also supply a native tombstone protobuf: its original bytes are saved as `system-exit-trace.bin`, and the faulting thread's signal, abort message, library/function/PC/Build ID and backtrace are decoded into the report. Android 9/10 use the saved journal and logcat; unavailable system traces are explicitly reported. Normal exits and system-reported user force-stops do not trigger a crash dialog. No signal handlers are replaced, so Android and CoreCLR retain their own crash handling. SIGKILL/low-memory termination cannot generate an in-process backtrace; an unrooted application cannot retrieve a tombstone the OS does not expose.

Use an arm64-v8a API 28+ device. Run `scripts/checks/check-apk.ps1` against the newly built APK to inspect launcher/runtime assets and native libraries. A successful build does not establish CoreCLR, GPU or gameplay compatibility with every device and tML release.
