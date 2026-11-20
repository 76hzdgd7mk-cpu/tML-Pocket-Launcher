package app.com.tmlpocket.core.runtime

import android.content.Context
import android.util.Log
import app.com.tmlpocket.core.platform.AndroidBridge
import app.com.tmlpocket.core.platform.NativeCoreClr
import app.com.tmlpocket.feature.launcher.LauncherSettings
import app.com.tmlpocket.feature.patches.PatchRepository
import app.com.tmlpocket.feature.renderers.AndroidRendererPluginPackageSource
import app.com.tmlpocket.feature.renderers.RendererLaunchEnvironment
import app.com.tmlpocket.feature.renderers.RendererPluginAssetStager
import app.com.tmlpocket.feature.renderers.RendererPluginRepository
import app.com.tmlpocket.feature.renderers.RendererSelection
import java.io.File

object GameRuntime {
    private const val TAG = "tMLPocketCoreClr"
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
        applyRendererSelection(context)
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

    private fun applyRendererSelection(context: Context) {
        val identity = LauncherSettings(context).read().optString("rendererPlugin", "native")
        if (identity == "native") return
        if (identity == RendererSelection.VULKAN) {
            if (context.packageManager.hasSystemFeature("android.hardware.vulkan.level", 1)) {
                setEnvironment("FNA3D_FORCE_DRIVER", "Vulkan")
                setEnvironment("SDL_GPU_DRIVER", "vulkan")
                Log.i(TAG, "Using SDL_GPU with the Vulkan backend")
            } else {
                Log.w(TAG, "Vulkan is unavailable on this device; using native OpenGL ES 3")
                AndroidBridge.setStartupStatus(
                    "使用系统渲染器",
                    "此设备未报告 Vulkan 支持，已回退到 OpenGL ES 3",
                    -1,
                )
            }
            return
        }
        try {
            val repository = RendererPluginRepository(
                AndroidRendererPluginPackageSource(context),
                RendererPluginAssetStager(File(context.filesDir, "renderers")),
                android.os.Build.VERSION.SDK_INT,
                android.os.Build.SUPPORTED_ABIS.toList(),
            )
            val staged = repository.stage(identity)
            RendererLaunchEnvironment.forRenderer(staged).forEach { (name, value) ->
                setEnvironment(name, value)
            }
            Log.i(TAG, "Using renderer plugin $identity from ${staged.libraryDirectory.absolutePath}")
        } catch (failure: Throwable) {
            Log.e(TAG, "Renderer plugin $identity unavailable; using native OpenGL ES 3", failure)
            AndroidBridge.setStartupStatus(
                "使用系统渲染器",
                "所选渲染器不可用，已回退到 OpenGL ES 3：${failure.message ?: "未知错误"}",
                -1,
            )
        }
    }
}
