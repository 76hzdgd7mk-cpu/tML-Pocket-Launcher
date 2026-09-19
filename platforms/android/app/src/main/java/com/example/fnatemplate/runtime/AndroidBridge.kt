package com.example.fnatemplate.runtime

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.text.InputType
import android.view.KeyEvent
import android.view.MotionEvent
import android.widget.Toast
import android.widget.EditText
import java.lang.ref.WeakReference
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.libsdl.app.SDLActivity

/** Android implementation used by the CoreCLR-side JniAndroidBridge. */
object AndroidBridge {
    private const val CREDENTIAL_ALIAS = "tmodloader.steam.credentials.v1"
    private const val CREDENTIAL_PREFS = "tmodloader.android.credentials"
    private const val CREDENTIAL_BLOB = "steam.credentials"
    private const val EVENT_LIFECYCLE = 0
    private const val EVENT_TEXT = 1
    private const val EVENT_KEY = 2
    private const val EVENT_TOUCH = 3
    private const val EVENT_FOCUS = 4
    private const val EVENT_BACK = 5
    private const val EVENT_PERMISSION = 6

    @Volatile
    private var activityReference: WeakReference<Activity>? = null

    @JvmStatic
    fun attach(activity: Activity) {
        activityReference = WeakReference(activity)
        NativeCoreClr.nativeRegisterBridgeActivity(activity)
    }

    @JvmStatic
    fun detach(activity: Activity) {
        if (activityReference?.get() === activity) {
            activityReference = null
            NativeCoreClr.nativeClearBridgeActivity()
        }
    }

    @JvmStatic
    fun showToast(message: String, longDuration: Int): Int {
        val activity = currentActivity() ?: return -1
        activity.runOnUiThread {
            Toast.makeText(
                activity,
                message,
                if (longDuration != 0) Toast.LENGTH_LONG else Toast.LENGTH_SHORT
            ).show()
        }
        return 0
    }

    @JvmStatic
    fun getClipboardText(): String? {
        val activity = currentActivity() ?: return null
        val manager = activity.getSystemService(Context.CLIPBOARD_SERVICE) as? android.content.ClipboardManager
            ?: return null
        val clip = manager.primaryClip ?: return null
        return clip.getItemAt(0)?.coerceToText(activity)?.toString()
    }

    @JvmStatic
    fun setClipboardText(text: String): Int {
        val activity = currentActivity() ?: return -1
        val manager = activity.getSystemService(Context.CLIPBOARD_SERVICE) as? android.content.ClipboardManager
            ?: return -1
        activity.runOnUiThread {
            manager.setPrimaryClip(ClipData.newPlainText(null, text))
        }
        return 0
    }

    @JvmStatic
    fun openUrl(url: String): Int {
        val activity = currentActivity() ?: return -1
        return try {
            activity.runOnUiThread {
                activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            }
            0
        } catch (_: Exception) {
            -1
        }
    }

    @JvmStatic
    fun setOrientation(landscape: Int): Int {
        val activity = currentActivity() ?: return -1
        activity.runOnUiThread {
            activity.requestedOrientation = if (landscape != 0) {
                ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            } else {
                ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
            }
        }
        return 0
    }

    @JvmStatic
    fun setImeVisible(visible: Int): Int {
        currentActivity() ?: return -1
        return if (visible != 0) {
            if (SDLActivity.showTextInput(0, 0, 1, 1)) 0 else -1
        } else {
            if (SDLActivity.hideTextInput()) 0 else -1
        }
    }

    @JvmStatic
    fun hasPermission(permission: String): Boolean {
        val activity = currentActivity() ?: return false
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
            activity.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
    }

    @JvmStatic
    fun requestPermission(permission: String, requestCode: Int): Int {
        val activity = currentActivity() ?: return -1
        activity.runOnUiThread {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
                activity.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) {
                postPermission(requestCode, true)
            } else {
                activity.requestPermissions(arrayOf(permission), requestCode)
            }
        }
        return 0
    }

    @JvmStatic
    fun showTextPrompt(title: String, password: Int, requestCode: Int): Int {
        val activity = currentActivity() ?: return -1
        activity.runOnUiThread {
            val input = EditText(activity)
            input.inputType = if (password != 0) {
                InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            } else {
                InputType.TYPE_CLASS_TEXT
            }
            AlertDialog.Builder(activity)
                .setTitle(title)
                .setView(input)
                .setNegativeButton(android.R.string.cancel) { _, _ -> postTextResult(requestCode, null) }
                .setPositiveButton(android.R.string.ok) { _, _ ->
                    postTextResult(requestCode, input.text?.toString())
                }
                .setOnCancelListener { postTextResult(requestCode, null) }
                .show()
            input.requestFocus()
        }
        return 0
    }

    @JvmStatic
    fun loadSteamCredentials(): String? {
        val activity = currentActivity() ?: return null
        val stored = activity.getSharedPreferences(CREDENTIAL_PREFS, Context.MODE_PRIVATE)
            .getString(CREDENTIAL_BLOB, null)
            ?: return null
        return try {
            decrypt(stored)
        } catch (_: Exception) {
            clearSteamCredentials()
            null
        }
    }

    @JvmStatic
    fun saveSteamCredentials(value: String): Int {
        val activity = currentActivity() ?: return -1
        return try {
            val encrypted = encrypt(value)
            activity.getSharedPreferences(CREDENTIAL_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(CREDENTIAL_BLOB, encrypted)
                .apply()
            0
        } catch (_: Exception) {
            -1
        }
    }

    @JvmStatic
    fun clearSteamCredentials(): Int {
        val activity = currentActivity() ?: return -1
        return try {
            activity.getSharedPreferences(CREDENTIAL_PREFS, Context.MODE_PRIVATE)
                .edit()
                .remove(CREDENTIAL_BLOB)
                .apply()
            val keyStore = java.security.KeyStore.getInstance("AndroidKeyStore")
            keyStore.load(null)
            if (keyStore.containsAlias(CREDENTIAL_ALIAS))
                keyStore.deleteEntry(CREDENTIAL_ALIAS)
            0
        } catch (_: Exception) {
            -1
        }
    }

    @JvmStatic
    fun postLifecycle(paused: Boolean) = post(
        kind = EVENT_LIFECYCLE,
        paused = paused
    )

    @JvmStatic
    fun postFocus(focused: Boolean) = post(
        kind = EVENT_FOCUS,
        focused = focused
    )

    @JvmStatic
    fun postBack() = post(EVENT_BACK)

    @JvmStatic
    fun postText(text: String) {
        if (text.isNotEmpty()) post(EVENT_TEXT, text = text)
    }

    @JvmStatic
    fun postKey(event: KeyEvent) = post(
        kind = EVENT_KEY,
        keyCode = event.keyCode,
        pressed = event.action == KeyEvent.ACTION_DOWN,
        action = event.action
    )

    @JvmStatic
    fun postTouch(event: MotionEvent): Boolean {
        val actionIndex = event.actionIndex
        post(
            kind = EVENT_TOUCH,
            pointerId = event.getPointerId(actionIndex),
            x = event.getX(actionIndex),
            y = event.getY(actionIndex),
            action = event.actionMasked
        )
        return false
    }

    @JvmStatic
    fun postPermission(requestCode: Int, granted: Boolean) = post(
        kind = EVENT_PERMISSION,
        requestCode = requestCode,
        granted = granted
    )

    private fun postTextResult(requestCode: Int, text: String?) = post(
        kind = EVENT_TEXT,
        text = text,
        requestCode = requestCode
    )

    private fun post(
        kind: Int,
        text: String? = null,
        keyCode: Int = 0,
        pressed: Boolean = false,
        pointerId: Int = 0,
        x: Float = 0f,
        y: Float = 0f,
        action: Int = 0,
        focused: Boolean = false,
        paused: Boolean = false,
        requestCode: Int = 0,
        granted: Boolean = false
    ) {
        NativeCoreClr.nativePostAndroidEvent(
            kind,
            SystemClock.elapsedRealtimeNanos(),
            text,
            keyCode,
            pressed,
            pointerId,
            x,
            y,
            action,
            focused,
            paused,
            requestCode,
            granted
        )
    }

    private fun credentialKey(): SecretKey {
        val keyStore = java.security.KeyStore.getInstance("AndroidKeyStore")
        keyStore.load(null)
        val existing = keyStore.getKey(CREDENTIAL_ALIAS, null) as? SecretKey
        if (existing != null) return existing

        val generator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            "AndroidKeyStore"
        )
        generator.init(
            KeyGenParameterSpec.Builder(
                CREDENTIAL_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build()
        )
        return generator.generateKey()
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, credentialKey())
        val ciphertext = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        val payload = byteArrayOf(cipher.iv.size.toByte()) + cipher.iv + ciphertext
        return Base64.encodeToString(payload, Base64.NO_WRAP)
    }

    private fun decrypt(value: String): String {
        val payload = Base64.decode(value, Base64.NO_WRAP)
        require(payload.isNotEmpty())
        val ivLength = payload[0].toInt() and 0xff
        require(ivLength > 0 && payload.size > ivLength + 1)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            credentialKey(),
            javax.crypto.spec.GCMParameterSpec(128, payload.copyOfRange(1, ivLength + 1))
        )
        return cipher.doFinal(payload.copyOfRange(ivLength + 1, payload.size))
            .toString(Charsets.UTF_8)
    }

    private fun currentActivity(): Activity? = activityReference?.get()
}
