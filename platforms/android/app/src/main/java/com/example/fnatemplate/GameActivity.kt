package com.example.fnatemplate

import android.app.AlertDialog
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.util.Log
import android.view.KeyEvent
import android.view.MotionEvent
import org.libsdl.app.SDLActivity
import com.example.fnatemplate.runtime.AndroidBridge

class GameActivity : SDLActivity() {
    override fun getLibraries(): Array<String> = arrayOf("SDL2", "FAudio", "main")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AndroidBridge.attach(this)
        window.decorView.systemUiVisibility = (
            android.view.View.SYSTEM_UI_FLAG_FULLSCREEN
                or android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            )
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
        AndroidBridge.postFocus(hasFocus)
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
            Handler(Looper.getMainLooper()).post {
                if (!isFinishing) {
                    AlertDialog.Builder(this)
                        .setTitle("FNA game failed to start")
                        .setMessage(error.message ?: error.javaClass.simpleName)
                        .setPositiveButton(android.R.string.ok) { _, _ -> finish() }
                        .setOnDismissListener { finish() }
                        .show()
                }
            }
        }
    }

    override fun onDestroy() {
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
}
