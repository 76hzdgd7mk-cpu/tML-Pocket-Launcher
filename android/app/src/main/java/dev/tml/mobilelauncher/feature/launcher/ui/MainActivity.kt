package dev.tml.mobilelauncher.feature.launcher.ui

import android.Manifest
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.Activity
import android.app.ActivityOptions
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import dev.tml.mobilelauncher.BuildConfig
import dev.tml.mobilelauncher.feature.files.FileBrowserAccess
import dev.tml.mobilelauncher.feature.game.GameActivity
import dev.tml.mobilelauncher.feature.launcher.LauncherController
import dev.tml.mobilelauncher.feature.mods.ModRepository.Companion.strings
import dev.tml.mobilelauncher.feature.stores.GogLoginActivity
import org.json.JSONObject

/** Hosts the approved offline UI; privileged operations only accept our main origin. */
class MainActivity : Activity() {
    private lateinit var controller: LauncherController
    private lateinit var web: WebView
    private var channel: JavaScriptReplyProxy? = null
    private var gogRequestId: String? = null
    private var launchPending = false
    private var returningFromGame = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        controller =
            (lastNonConfigurationInstance as? LauncherController)
                ?: LauncherController(applicationContext)
        applyOrientation()
        buildUi()
        enterImmersiveMode()
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT
            ) {
                handleBack()
            }
        }
    }

    override fun onStart() {
        super.onStart()
        controller.observer = { snapshot ->
            send(JSONObject().put("event", "snapshot").put("data", snapshot))
        }
    }

    override fun onResume() {
        super.onResume()
        enterImmersiveMode()
        controller.resumeStores()
        if (returningFromGame) {
            returningFromGame = false
            web.evaluateJavascript(
                "window.dispatchEvent(new Event('launcher:game-returned'))",
                null,
            )
        }
        if (::web.isInitialized)
            web.evaluateJavascript("window.dispatchEvent(new Event('launcher:files-resume'))", null)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterImmersiveMode()
    }

    private fun launchOptions(params: JSONObject): Bundle? {
        if (
            !controller.settings.read().optBoolean("motion", true) ||
                !params.optBoolean("motion", true) ||
                !ValueAnimator.areAnimatorsEnabled()
        )
            return ActivityOptions.makeCustomAnimation(this, 0, 0).toBundle()
        val origin = params.optJSONObject("transition") ?: return null
        val values =
            listOf("left", "top", "width", "height", "viewportWidth").map { origin.optDouble(it) }
        if (values.any { !it.isFinite() } || values[4] <= 0 || web.width <= 0 || web.height <= 0)
            return null
        val scale = web.width / values[4]
        val left = (values[0] * scale).toInt().coerceIn(0, web.width - 1)
        val top = (values[1] * scale).toInt().coerceIn(0, web.height - 1)
        val width = (values[2] * scale).toInt().coerceIn(1, web.width - left)
        val height = (values[3] * scale).toInt().coerceIn(1, web.height - top)
        return ActivityOptions.makeClipRevealAnimation(web, left, top, width, height).toBundle()
    }

    private fun enterImmersiveMode() {
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.apply {
                hide(WindowInsets.Type.systemBars())
                systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility =
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        }
    }

    override fun onStop() {
        controller.observer = null
        super.onStop()
    }

    @Deprecated("Retains workers independently of Activity")
    override fun onRetainNonConfigurationInstance(): Any = controller

    override fun onDestroy() {
        channel = null
        if (::web.isInitialized) {
            web.stopLoading()
            (web.parent as? android.view.ViewGroup)?.removeView(web)
            web.destroy()
        }
        if (!isChangingConfigurations) controller.close()
        super.onDestroy()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildUi() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            AlertDialog.Builder(this)
                .setTitle("请更新 Android System WebView")
                .setMessage("启动器需要支持安全消息接口的系统 WebView。请更新后重新打开。")
                .setPositiveButton("关闭") { _, _ -> finish() }
                .show()
            return
        }
        val assets = WebViewAssetLoader.AssetsPathHandler(this)
        val loader =
            WebViewAssetLoader.Builder()
                .addPathHandler("/") { path -> assets.handle("ui/$path") }
                .build()
        web =
            WebView(this).apply {
                setBackgroundColor(Color.rgb(12, 15, 20))
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                settings.setSupportMultipleWindows(false)
                settings.mediaPlaybackRequiresUserGesture = true
                webViewClient =
                    object : WebViewClient() {
                        override fun shouldInterceptRequest(
                            view: WebView,
                            request: WebResourceRequest,
                        ): WebResourceResponse? {
                            if (request.url.toString().startsWith("data:image/")) return null
                            if (request.url.scheme != "https" || request.url.host != HOST)
                                return WebResourceResponse(
                                    "text/plain",
                                    "UTF-8",
                                    403,
                                    "Forbidden",
                                    emptyMap(),
                                    "External content blocked".byteInputStream(),
                                )
                            return loader.shouldInterceptRequest(request.url)
                                ?: WebResourceResponse(
                                    "text/plain",
                                    "UTF-8",
                                    404,
                                    "Not Found",
                                    emptyMap(),
                                    ByteArray(0).inputStream(),
                                )
                        }

                        override fun shouldOverrideUrlLoading(
                            view: WebView,
                            request: WebResourceRequest,
                        ): Boolean {
                            if (request.url.scheme == "https" && request.url.host == HOST)
                                return false
                            if (request.isForMainFrame && request.hasGesture())
                                openExternal(request.url.toString())
                            return true
                        }
                    }
                webChromeClient = WebChromeClient()
            }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        WebViewCompat.addWebMessageListener(web, "LauncherNative", setOf(ORIGIN)) {
            _,
            message,
            origin,
            mainFrame,
            reply ->
            if (!mainFrame || origin.toString() != ORIGIN) return@addWebMessageListener
            channel = reply
            val text = message.data ?: return@addWebMessageListener
            if (text.length > 256 * 1024) return@addWebMessageListener
            var id: String? = null
            try {
                val request = JSONObject(text)
                id = request.getString("id")
                require(id.length <= 80)
                dispatch(
                    id,
                    request.getString("method"),
                    request.optJSONObject("params") ?: JSONObject(),
                )
            } catch (failure: Exception) {
                id?.let { respond(it, Result.failure(failure)) }
            }
        }
        setContentView(web)
        web.loadUrl("$ORIGIN/index.html")
    }

    private fun dispatch(id: String, method: String, params: JSONObject) {
        when (method) {
            "store.gog.authorize" -> {
                require(gogRequestId == null) { "GOG 授权页面已经打开" }
                controller.request(
                    "store.gog.auth",
                    JSONObject().put("state", java.util.UUID.randomUUID().toString()),
                ) { result ->
                    if (isDestroyed || isFinishing) return@request
                    result.fold(
                        { value ->
                            runCatching {
                                    gogRequestId = id
                                    startActivityForResult(
                                        Intent(this, GogLoginActivity::class.java)
                                            .putExtra(
                                                "url",
                                                (value as JSONObject).getString("url"),
                                            ),
                                        GOG_LOGIN,
                                    )
                                }
                                .onFailure {
                                    gogRequestId = null
                                    respond(id, Result.failure(it))
                                }
                        },
                        { respond(id, Result.failure(it)) },
                    )
                }
            }
            "files.permission" -> {
                if (!FileBrowserAccess(this).granted()) {
                    if (Build.VERSION.SDK_INT >= 30) {
                        val intent =
                            Intent(
                                Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                                Uri.parse("package:$packageName"),
                            )
                        try {
                            startActivity(intent)
                        } catch (_: android.content.ActivityNotFoundException) {
                            startActivity(
                                Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
                            )
                        }
                    } else {
                        requestPermissions(
                            arrayOf(
                                Manifest.permission.READ_EXTERNAL_STORAGE,
                                Manifest.permission.WRITE_EXTERNAL_STORAGE,
                            ),
                            FILE_ACCESS,
                        )
                    }
                }
                respond(id, Result.success(true))
            }
            "launch" -> {
                if (launchPending || returningFromGame) {
                    respond(id, Result.failure(IllegalStateException("游戏启动正在进行")))
                    return
                }
                launchPending = true
                controller.request("launch.check", JSONObject()) { result ->
                    if (isDestroyed || isFinishing) return@request
                    val launched =
                        result.mapCatching {
                            val args =
                                (it as JSONObject)
                                    .getJSONArray("arguments")
                                    .strings()
                                    .toTypedArray()
                            startActivity(
                                Intent(this, GameActivity::class.java)
                                    .putExtra("launcherArguments", args)
                                    .putExtra("tmlVersion", it.optString("version")),
                                launchOptions(params),
                            )
                            returningFromGame = true
                            JSONObject().put("handedOff", true)
                        }
                    launchPending = false
                    respond(id, launched)
                }
            }
            "openExternal" -> {
                openExternal(params.getString("url"))
                respond(id, Result.success(true))
            }
            "finish" -> {
                respond(id, Result.success(true))
                finish()
            }
            "share" -> {
                val text = params.getString("text")
                require(text.length <= 200_000) { "分享内容过长" }
                startActivity(
                    Intent.createChooser(
                        Intent(Intent.ACTION_SEND)
                            .setType("text/plain")
                            .putExtra(Intent.EXTRA_TEXT, text),
                        "分享",
                    )
                )
                respond(id, Result.success(true))
            }
            else ->
                controller.request(method, params) { result ->
                    if (method == "settings.save" && result.isSuccess) applyOrientation()
                    if (method == "store.gog.logout" && result.isSuccess) {
                        android.webkit.CookieManager.getInstance().removeAllCookies(null)
                        android.webkit.CookieManager.getInstance().flush()
                    }
                    respond(id, result)
                }
        }
    }

    private fun applyOrientation() {
        requestedOrientation =
            if (controller.settings.read().optString("orientation", "landscape") == "portrait")
                ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
            else ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
    }

    private fun openExternal(address: String) {
        val uri = Uri.parse(address)
        require(uri.scheme == "https" && !uri.host.isNullOrBlank()) { "只能打开 HTTPS 网页" }
        startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == FILE_ACCESS && ::web.isInitialized)
            web.evaluateJavascript("window.dispatchEvent(new Event('launcher:files-resume'))", null)
    }

    @Deprecated("GOG authorization Activity callback")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == GOG_LOGIN) {
            val id = gogRequestId
            gogRequestId = null
            if (id != null) {
                val code = data?.getStringExtra("code")
                if (resultCode != RESULT_OK || code == null) respond(id, Result.success(false))
                else
                    controller.request("store.gog.login", JSONObject().put("code", code)) {
                        respond(id, it)
                    }
            }
            return
        }
    }

    private fun respond(id: String, result: Result<Any>) {
        val response = JSONObject().put("id", id).put("ok", result.isSuccess)
        result.fold({ response.put("data", it) }, { response.put("error", it.message ?: "操作失败") })
        send(response)
    }

    private fun send(message: JSONObject) {
        if (!isDestroyed && !isFinishing && ::web.isInitialized)
            runCatching { channel?.postMessage(message.toString()) }
    }

    @Deprecated("Web launcher owns page navigation")
    @SuppressLint("GestureBackNavigation") // Legacy dispatch for API 28–32 only.
    override fun onBackPressed() {
        handleBack()
    }

    private fun handleBack() {
        if (::web.isInitialized)
            web.evaluateJavascript("window.dispatchEvent(new Event('launcher:back'))", null)
        else super.onBackPressed()
    }

    companion object {
        private const val HOST = "appassets.androidplatform.net"
        private const val ORIGIN = "https://appassets.androidplatform.net"
        private const val GOG_LOGIN = 103
        private const val FILE_ACCESS = 104
    }
}
