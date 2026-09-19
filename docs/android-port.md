# Android Port

The Android app uses SDL2/FNA3D/FAudio for the native game surface and a
template-owned JNI/hostfxr layer for .NET 10 CoreCLR. The managed host is
started once from `GameActivity`; it does not spawn `dotnet`, `steamcmd`, or a
second CoreCLR process.

The tModLoader source remains `net8.0`. Android-specific source is generated
under the ignored `build/tmodloader-src` directory from the pinned upstream
checkout and `D:\tModLoader\src`. Patches under `patches/android` are applied
to that generated tree. The original `D:\tModLoader` checkout is never changed.

`IAndroidBridge` is the managed boundary. `JniAndroidBridge` calls exported
functions in `libmain.so`; the native layer uses the registered Activity and
the Kotlin `AndroidBridge` object. SDL's existing text editor is reused for
IME display, while lifecycle, text, key, touch, focus, back, and permission
events are copied into a bounded FIFO.

The tModLoader `ReLogic.OS.AndroidPlatformServices` interface is configured
through a `DispatchProxy` immediately after loading the tModLoader assembly.
This keeps upstream tModLoader independent from the bootstrap assembly while
making clipboard, paths, URL launch, orientation, and IME calls functional.
