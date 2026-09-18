package com.example.fnatemplate.runtime

object NativeCoreClr {
    init {
        System.loadLibrary("dotnethost")
    }

    @JvmStatic
    external fun nativeLaunch(
        assemblyPath: String,
        args: Array<String>,
        dotnetRoot: String
    ): Int

    @JvmStatic
    external fun nativeLastError(): String

    @JvmStatic
    external fun nativeChdir(path: String): Int

    @JvmStatic
    external fun nativeSetEnv(name: String, value: String): Int
}
