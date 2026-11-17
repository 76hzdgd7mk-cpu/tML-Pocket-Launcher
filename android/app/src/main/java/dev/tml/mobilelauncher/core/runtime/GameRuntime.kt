package dev.tml.mobilelauncher.core.runtime

import android.content.Context
import android.util.Log
import dev.tml.mobilelauncher.core.platform.AndroidBridge
import dev.tml.mobilelauncher.core.platform.NativeCoreClr
import dev.tml.mobilelauncher.feature.launcher.LauncherSettings
import dev.tml.mobilelauncher.feature.patches.PatchRepository
import java.io.File

object GameRuntime {
    private const val TAG = "FnaAndroidCoreClr"
    private const val ANDROID_CRYPTO_LIBRARY =
        "shared/Microsoft.NETCore.App/10.0.4/libSystem.Security.Cryptography.Native.Android.so"
    private val cryptoLoadLock = Any()
    private var cryptoLibraryLoaded = false

    fun launch(context: Context, arguments: Array<String>) {
        AndroidBridge.setStartupStatus("准备出发", "正在准备 Android 运行环境…", -1)
        val prepared = AssetBootstrap.prepare(context, arguments)
        loadAndroidCryptoProvider(prepared.runtimeRoot)
        setEnvironment("DOTNET_ROOT", prepared.runtimeRoot)
        setEnvironment("DOTNET_ROOT_ARM64", prepared.runtimeRoot)
        setEnvironment("HOME", prepared.userDataDirectory)
        setEnvironment("XDG_DATA_HOME", prepared.userDataDirectory)
        setEnvironment("XDG_CONFIG_HOME", prepared.userDataDirectory)
        setEnvironment("XDG_CACHE_HOME", context.cacheDir.absolutePath)
        setEnvironment("TMPDIR", context.cacheDir.absolutePath)
        setEnvironment("TML_ANDROID", "1")
        val patchRepository = PatchRepository(File(context.filesDir, "patches"))
        setEnvironment("TML_MOBILE_PATCHES", patchRepository.enabledBuiltinIds().joinToString(","))
        val renderScale = LauncherSettings(context).read().optInt("renderScale", 100)
        setEnvironment(
            "TML_MOBILE_RENDER_SCALE",
            when (renderScale) {
                50 -> "0.5"
                75 -> "0.75"
                else -> "1.0"
            },
        )
        setEnvironment("TML_ANDROID_GAME_ROOT", prepared.workingDirectory)
        setEnvironment("TML_TMODLOADER_ASSEMBLY", prepared.tmlAssembly)
        setEnvironment("TML_ANDROID_CONTENT", prepared.contentDirectory)
        setEnvironment("TML_ANDROID_TERRARIA_ROOT", prepared.terrariaDirectory)
        setEnvironment("TML_ANDROID_CACHE", context.cacheDir.absolutePath)
        setEnvironment("FNA_PLATFORM_BACKEND", "SDL2")
        setEnvironment("FNA3D_OPENGL_FORCE_ES3", "1")
        setEnvironment("FNA3D_FORCE_DRIVER", "OpenGL")
        setEnvironment("FNA3D_MOJOSHADER_PROFILE", "glsles3")
        setEnvironment("SDL_TOUCH_MOUSE_EVENTS", "0")
        setEnvironment("SDL_MOUSE_TOUCH_EVENTS", "0")
        setEnvironment("SDL_AUDIODRIVER", "aaudio")

        check(NativeCoreClr.nativeChdir(prepared.workingDirectory) == 0) {
            "runtime: failed to change working directory to ${prepared.workingDirectory}"
        }

        Log.i(TAG, "Launching ${prepared.assemblyPath} with CoreCLR root ${prepared.runtimeRoot}")
        AndroidBridge.setStartupStatus("正在进入游戏", "正在加载 tModLoader，等待游戏首帧…", -1)
        val result =
            NativeCoreClr.nativeLaunch(
                prepared.assemblyPath,
                prepared.arguments,
                prepared.runtimeRoot,
            )
        if (result != 0) {
            val detail = NativeCoreClr.nativeLastError().ifBlank { "no native diagnostic" }
            error("CoreCLR launch failed with exit code $result: $detail")
        }
    }

    internal fun loadAndroidCryptoProvider(runtimeRoot: String) {
        synchronized(cryptoLoadLock) {
            if (cryptoLibraryLoaded) return

            val library = File(runtimeRoot, ANDROID_CRYPTO_LIBRARY)
            check(library.isFile) { "Android crypto provider is missing: ${library.absolutePath}" }
            System.load(library.absolutePath)
            cryptoLibraryLoaded = true
            Log.i(TAG, "Loaded Android crypto provider")
        }
    }

    private fun setEnvironment(name: String, value: String) {
        check(NativeCoreClr.nativeSetEnv(name, value) == 0) { "runtime: failed to set $name" }
    }
}
