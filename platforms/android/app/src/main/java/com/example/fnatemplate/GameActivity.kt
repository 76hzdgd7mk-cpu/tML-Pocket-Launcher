package com.example.fnatemplate

import android.app.AlertDialog
import android.os.Bundle
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.util.Log
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.content.Context
import org.libsdl.app.SDLActivity
import com.example.fnatemplate.runtime.AndroidBridge
import java.util.concurrent.CountDownLatch

class GameActivity : SDLActivity() {
    private lateinit var startupOverlay: FrameLayout
    private lateinit var startupTitle: TextView
    private lateinit var startupDetail: TextView
    private lateinit var startupProgress: ProgressBar
    private lateinit var downloadInstallOverlay: DownloadInstallOverlay

    @Volatile
    private var latestStartupDetail = "Preparing runtime..."

    private var steamLoginOverlay: SteamLoginOverlay? = null

    override fun getLibraries(): Array<String> = arrayOf("SDL2", "FAudio", "main")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createStartupOverlay()
        createDownloadInstallOverlay()
        AndroidBridge.attach(this)
        enterImmersiveMode()
    }

    fun updateStartupStatus(title: String, detail: String, progressPercent: Int) {
        latestStartupDetail = detail
        if (!::downloadInstallOverlay.isInitialized) {
            startupOverlay.visibility = View.VISIBLE
            startupTitle.text = title
            startupDetail.text = detail
            startupProgress.isIndeterminate = progressPercent < 0
            if (progressPercent >= 0) {
                startupProgress.progress = progressPercent.coerceIn(0, 100)
            }
            return
        }
        if (isFinishing || isDestroyed) return
        startupOverlay.visibility = View.GONE
        downloadInstallOverlay.render(parseLauncherState(title, detail, progressPercent))
        downloadInstallOverlay.show()
    }

    fun hideStartupStatus() {
        startupOverlay.visibility = View.GONE
        if (::downloadInstallOverlay.isInitialized) downloadInstallOverlay.hide()
    }

    fun recordStartupStatus(detail: String) {
        latestStartupDetail = detail
    }

    fun showSteamPrompt(
        title: String,
        password: Boolean,
        submit: (String?) -> Unit
    ) {
        if (::downloadInstallOverlay.isInitialized) downloadInstallOverlay.hide()
        if (steamLoginOverlay == null) {
            steamLoginOverlay = SteamLoginOverlay(this)
        }
        steamLoginOverlay?.show(title, password, submit)
    }

    fun hideSteamPrompt() {
        steamLoginOverlay?.hide()
        if (::downloadInstallOverlay.isInitialized && !isFinishing && !isDestroyed) {
            downloadInstallOverlay.show()
        }
    }

    override fun getMainFunction(): String = "SDL_main"

    override fun onPause() {
        AndroidBridge.postLifecycle(true)
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        AndroidBridge.postLifecycle(false)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterImmersiveMode()
        AndroidBridge.postFocus(hasFocus)
    }

    fun enterImmersiveMode() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        AndroidBridge.postKey(event)
        return super.dispatchKeyEvent(event)
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        AndroidBridge.postTouch(event)
        return super.dispatchTouchEvent(event)
    }

    override fun onBackPressed() {
        AndroidBridge.postBack()
        super.onBackPressed()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        AndroidBridge.postPermission(
            requestCode,
            grantResults.isNotEmpty() && grantResults[0] == android.content.pm.PackageManager.PERMISSION_GRANTED
        )
    }

    override fun Main(args: Array<String>?) {
        try {
            com.example.fnatemplate.runtime.GameRuntime.launch(this, args ?: emptyArray())
        } catch (error: Throwable) {
            Log.e(TAG, "Game launch failed", error)
            val failureLatch = CountDownLatch(1)
            val detail = latestStartupDetail.ifBlank {
                error.message ?: error.javaClass.simpleName
            }
            Log.i(TAG, "Scheduling startup failure UI: $detail")
            Handler(Looper.getMainLooper()).post {
                Log.i(TAG, "Rendering startup failure UI; finishing=$isFinishing")
                if (!isFinishing) {
                    updateStartupStatus(
                        "Startup failed",
                        detail,
                        0
                    )
                    AlertDialog.Builder(this)
                        .setTitle("tModLoader Mobile failed to start")
                        .setMessage(detail)
                        .setPositiveButton(android.R.string.ok) { _, _ ->
                            failureLatch.countDown()
                            finish()
                        }
                        .setOnCancelListener {
                            failureLatch.countDown()
                            finish()
                        }
                        .show()
                } else {
                    failureLatch.countDown()
                }
            }
            try {
                failureLatch.await()
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
            }
        }
    }

    override fun onDestroy() {
        steamLoginOverlay?.hide()
        if (::downloadInstallOverlay.isInitialized) downloadInstallOverlay.hide()
        AndroidBridge.detach(this)
        super.onDestroy()
        Handler(Looper.getMainLooper()).postDelayed({
            Process.killProcess(Process.myPid())
            System.exit(0)
        }, 100L)
    }

    companion object {
        private const val TAG = "FnaAndroidCoreClr"
    }

    private fun createStartupOverlay() {
        val overlay = FrameLayout(this).apply {
            setBackgroundColor(Color.argb(235, 8, 12, 18))
            isClickable = true
            isFocusable = true
            contentDescription = "tModLoader Mobile startup status"
        }

        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(28), dp(24), dp(28), dp(24))
            background = GradientDrawable().apply {
                setColor(Color.rgb(24, 31, 42))
                cornerRadius = dp(8).toFloat()
            }
        }
        val panelLayout = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply {
            gravity = Gravity.CENTER
            leftMargin = dp(48)
            rightMargin = dp(48)
        }

        startupTitle = TextView(this).apply {
            setTextColor(Color.WHITE)
            textSize = 22f
            typeface = Typeface.DEFAULT_BOLD
        }
        startupDetail = TextView(this).apply {
            setTextColor(Color.rgb(210, 218, 230))
            textSize = 16f
            setPadding(0, dp(12), 0, dp(16))
        }
        startupProgress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            isIndeterminate = true
            contentDescription = "Startup progress"
        }

        panel.addView(startupTitle)
        panel.addView(startupDetail)
        panel.addView(startupProgress, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(8)
        ))
        overlay.addView(panel, panelLayout)
        addContentView(overlay, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ))
        startupOverlay = overlay
        updateStartupStatus("Starting tModLoader Mobile", "Preparing runtime...", -1)
    }

    private fun createDownloadInstallOverlay() {
        downloadInstallOverlay = DownloadInstallOverlay(this).apply {
            setActionHandler { action ->
                AndroidBridge.postLauncherAction(action.ordinal)
                enterImmersiveMode()
            }
            render(
                LauncherUiState.Installing(
                    "Starting tModLoader Mobile",
                    "Preparing runtime..."
                )
            )
            show()
        }
        startupOverlay.visibility = View.GONE
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density + 0.5f).toInt()
}
