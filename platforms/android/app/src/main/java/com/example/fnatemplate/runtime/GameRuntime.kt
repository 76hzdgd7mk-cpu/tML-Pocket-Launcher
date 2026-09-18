package com.example.fnatemplate.runtime

import android.content.Context
import android.util.Log
import java.io.File

object GameRuntime {
    private const val TAG = "FnaAndroidCoreClr"

    fun launch(context: Context, arguments: Array<String>) {
        val prepared = AssetBootstrap.prepare(context, arguments)
        setEnvironment("DOTNET_ROOT", prepared.runtimeRoot)
        setEnvironment("DOTNET_ROOT_ARM64", prepared.runtimeRoot)
        setEnvironment("HOME", prepared.workingDirectory)
        setEnvironment("XDG_DATA_HOME", prepared.workingDirectory)
        setEnvironment("XDG_CONFIG_HOME", prepared.workingDirectory)
        setEnvironment("XDG_CACHE_HOME", context.cacheDir.absolutePath)
        setEnvironment("TMPDIR", context.cacheDir.absolutePath)
        setEnvironment("FNA_PLATFORM_BACKEND", "SDL2")
        setEnvironment("FNA3D_OPENGL_FORCE_ES3", "1")

        check(NativeCoreClr.nativeChdir(prepared.workingDirectory) == 0) {
            "runtime: failed to change working directory to ${prepared.workingDirectory}"
        }

        Log.i(TAG, "Launching ${prepared.assemblyPath} with CoreCLR root ${prepared.runtimeRoot}")
        val result = NativeCoreClr.nativeLaunch(
            prepared.assemblyPath,
            prepared.arguments,
            prepared.runtimeRoot
        )
        if (result != 0) {
            val detail = NativeCoreClr.nativeLastError().ifBlank { "no native diagnostic" }
            error("CoreCLR launch failed with exit code $result: $detail")
        }
    }

    private fun setEnvironment(name: String, value: String) {
        check(NativeCoreClr.nativeSetEnv(name, value) == 0) {
            "runtime: failed to set $name"
        }
    }
}
