package app.com.tmlpocket.feature.launcher.ui

import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.util.Locale

internal object SteamWorkshopPreview {
    private val hosts = setOf(
        "steamuserimages-a.akamaihd.net",
        "steamusercontent-a.akamaihd.net",
        "images.steamusercontent.com",
    )
    private val imageTypes = setOf("image/gif", "image/jpeg", "image/png", "image/webp")
    private const val MAX_BYTES = 4 * 1024 * 1024

    internal fun isAllowed(address: String): Boolean = runCatching {
        val uri = URI(address)
        uri.scheme.equals("https", true) &&
            uri.host?.lowercase(Locale.ROOT) in hosts &&
            uri.userInfo == null &&
            (uri.port == -1 || uri.port == 443)
    }.getOrDefault(false)

    internal fun load(address: String): WebResourceResponse? {
        var current = address
        repeat(4) {
            if (!isAllowed(current)) return null
            val connection = URL(current).openConnection() as HttpURLConnection
            try {
                connection.instanceFollowRedirects = false
                connection.connectTimeout = 8_000
                connection.readTimeout = 12_000
                connection.setRequestProperty("User-Agent", "tML-Pocket-Launcher")
                val status = connection.responseCode
                if (status in setOf(301, 302, 303, 307, 308)) {
                    current = URL(URL(current), connection.getHeaderField("Location") ?: return null).toString()
                    return@repeat
                }
                if (status !in 200..299) return null
                val type = connection.contentType?.substringBefore(';')?.trim()?.lowercase(Locale.ROOT)
                if (type == null || type !in imageTypes || connection.contentLengthLong > MAX_BYTES) return null
                val bytes = connection.inputStream.use(::readBounded)
                if (bytes.isEmpty()) return null
                return WebResourceResponse(
                    type,
                    null,
                    status,
                    "OK",
                    mapOf("Cache-Control" to "public, max-age=86400", "X-Content-Type-Options" to "nosniff"),
                    ByteArrayInputStream(bytes),
                )
            } catch (_: Exception) {
                return null
            } finally {
                connection.disconnect()
            }
        }
        return null
    }

    private fun readBounded(input: java.io.InputStream): ByteArray {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            require(output.size() + count <= MAX_BYTES) { "Steam 图片过大" }
            output.write(buffer, 0, count)
        }
        return output.toByteArray()
    }
}
