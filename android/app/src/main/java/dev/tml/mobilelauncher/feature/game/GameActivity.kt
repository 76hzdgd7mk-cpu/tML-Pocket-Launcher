package dev.tml.mobilelauncher.feature.game

import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.FrameLayout
import dev.tml.mobilelauncher.core.platform.AndroidBridge
import dev.tml.mobilelauncher.core.runtime.GameRuntime
import dev.tml.mobilelauncher.feature.game.startup.GameStartupOverlay
import dev.tml.mobilelauncher.feature.launcher.LauncherSettings
import java.util.concurrent.CountDownLatch
import org.libsdl.app.SDLActivity

/** Owns the SDL process; installation and downloads stay in the launcher Activity. */
class GameActivity : SDLActivity() {
    private lateinit var startupOverlay: GameStartupOverlay
    @Volatile private var latestDetail = "正在准备运行时…"
    private var startupVisible = true

    override fun getLibraries() =
        arrayOf("SDL3", "SDL2_compat", "FAudio_sdl3", "FNA3D_sdl3", "main")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createStartupOverlay()
        AndroidBridge.attach(this)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.decorView.setOnApplyWindowInsetsListener { view, insets ->
                AndroidBridge.postImeVisibility(insets.isVisible(WindowInsets.Type.ime()))
                view.onApplyWindowInsets(insets)
            }
            window.decorView.requestApplyInsets()
        }
        enterImmersiveMode()
        startupOverlay.resumeMotion()
    }

    fun updateStartupStatus(title: String, detail: String, progressPercent: Int) {
        latestDetail = detail
        if (!::startupOverlay.isInitialized || isFinishing || isDestroyed) return
        if (!startupVisible) return
        startupOverlay.update(title, detail, progressPercent)
    }

    fun recordStartupStatus(detail: String) {
        latestDetail = detail
    }

    fun hideStartupStatus() {
        startupVisible = false
        startupOverlay.firstFrame {}
    }

    fun enterImmersiveMode() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.apply {
                hide(WindowInsets.Type.systemBars())
                systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        }
    }

    fun exitImmersiveMode() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(true)
            window.insetsController?.show(WindowInsets.Type.systemBars())
        }
    }

    override fun onPause() {
        if (::startupOverlay.isInitialized) startupOverlay.pauseMotion()
        AndroidBridge.postLifecycle(true)
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        if (::startupOverlay.isInitialized) startupOverlay.resumeMotion()
        AndroidBridge.postLifecycle(false)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterImmersiveMode()
        AndroidBridge.postFocus(hasFocus)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        AndroidBridge.postKey(event)
        return super.dispatchKeyEvent(event)
    }

    @Deprecated("SDL handles the game back event")
    override fun onBackPressed() {
        if (::startupOverlay.isInitialized && startupOverlay.returnIfFailed()) return
        AndroidBridge.postBack()
        super.onBackPressed()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        AndroidBridge.postPermission(
            requestCode,
            grantResults.firstOrNull() == android.content.pm.PackageManager.PERMISSION_GRANTED,
        )
    }

    override fun main() {
        try {
            GameRuntime.launch(
                this,
                getArguments() +
                    (intent.getStringArrayExtra("launcherArguments") ?: emptyArray()),
            )
        } catch (failure: Throwable) {
            Log.e(TAG, "Game launch failed", failure)
            runCatching {
                val directory = java.io.File(filesDir, "userdata/Logs").apply { mkdirs() }
                java.io
                    .File(directory, "launcher-startup.log")
                    .appendText("${java.util.Date()}\n${failure.stackTraceToString()}\n")
            }
            val dismissed = CountDownLatch(1)
            val detail = failure.message ?: latestDetail
            Handler(Looper.getMainLooper()).post {
                if (isFinishing || isDestroyed) dismissed.countDown()
                else {
                    startupVisible = true
                    startupOverlay.failed(detail) {
                        dismissed.countDown()
                        finish()
                    }
                }
            }
            try {
                dismissed.await()
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
            }
        }
    }

    override fun onDestroy() {
        if (::startupOverlay.isInitialized) startupOverlay.release()
        AndroidBridge.detach(this)
        super.onDestroy()
        // CoreCLR and SDL cannot be initialized twice in this process.
        Handler(Looper.getMainLooper()).postDelayed({ Process.killProcess(Process.myPid()) }, 100)
    }

    private fun createStartupOverlay() {
        startupOverlay =
            GameStartupOverlay(
                this,
                intent.getStringExtra("tmlVersion").orEmpty(),
                LauncherSettings(this).read().optBoolean("motion", true),
            )
        addContentView(startupOverlay, FrameLayout.LayoutParams(-1, -1))
        updateStartupStatus("正在启动 tModLoader", latestDetail, -1)
    }

    companion object {
        private const val TAG = "FnaAndroidCoreClr"
    }
}
