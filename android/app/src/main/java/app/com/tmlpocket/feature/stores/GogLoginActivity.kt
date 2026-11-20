package app.com.tmlpocket.feature.stores

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

/** Official GOG pages have no launcher bridge and cannot access local launcher assets. */
class GogLoginActivity : Activity() {
    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val address =
            intent.getStringExtra("url")
                ?: run {
                    finish()
                    return
                }
        val initial = Uri.parse(address)
        if (
            initial.scheme != "https" || initial.host != "auth.gog.com" || initial.path != "/auth"
        ) {
            finish()
            return
        }
        web =
            WebView(this).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                webViewClient =
                    object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(
                            view: WebView,
                            request: WebResourceRequest,
                        ): Boolean {
                            val uri = request.url
                            if (!request.isForMainFrame) return false
                            if (
                                uri.scheme == "https" &&
                                    uri.host == "embed.gog.com" &&
                                    uri.path == "/on_login_success"
                            ) {
                                val expected = initial.getQueryParameter("state")
                                val received = uri.getQueryParameter("state")
                                val code = uri.getQueryParameter("code")
                                if (
                                    code != null &&
                                        code.length in 1..8192 &&
                                        (received == null || received == expected)
                                ) {
                                    setResult(RESULT_OK, Intent().putExtra("code", code))
                                }
                                finish()
                                return true
                            }
                            return uri.scheme != "https" ||
                                !(uri.host == "gog.com" || uri.host?.endsWith(".gog.com") == true)
                        }
                    }
            }
        setContentView(web)
        if (savedInstanceState == null) web.loadUrl(address)
        else web.restoreState(savedInstanceState)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        web.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        if (::web.isInitialized) {
            web.stopLoading()
            web.destroy()
        }
        super.onDestroy()
    }
}
