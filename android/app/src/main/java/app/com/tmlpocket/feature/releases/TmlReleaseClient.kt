package app.com.tmlpocket.feature.releases

import java.io.File
import java.io.IOException
import java.io.InterruptedIOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import org.json.JSONArray

/** GitHub release metadata and downloads. No Android dependencies; connections are injectable for tests. */
class TmlReleaseClient(
    private val releasesUrl: String = "https://api.github.com/repos/tModLoader/tModLoader/releases",
    private val connect: (URL) -> HttpURLConnection = { it.openConnection() as HttpURLConnection }
) {
    fun releases(page: Int, cancelled: () -> Boolean = { false }): TmlReleasePage {
        require(page > 0)
        checkCancelled(cancelled)
        val connection = connection("$releasesUrl?per_page=$PAGE_SIZE&page=$page")
        try {
            checkResponse(connection)
            val body = connection.inputStream.use { input ->
                val output = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(16 * 1024)
                while (true) {
                    checkCancelled(cancelled)
                    val count = input.read(buffer)
                    if (count < 0) break
                    if (output.size() + count > 4 * 1024 * 1024) throw IOException("版本列表过大")
                    output.write(buffer, 0, count)
                }
                output.toString("UTF-8")
            }
            checkCancelled(cancelled)
            return parsePage(body)
        } finally {
            connection.disconnect()
        }
    }

    fun download(
        release: TmlRelease,
        cacheDir: File,
        cancelled: () -> Boolean = { false },
        progress: (Long, Long) -> Unit = { _, _ -> }
    ): File {
        checkCancelled(cancelled)
        if (!cacheDir.isDirectory && !cacheDir.mkdirs()) throw IOException("无法创建下载缓存")
        val partial = File.createTempFile("tml-${release.id}-", ".part", cacheDir)
        var completed = false
        try {
            val connection = connection(release.downloadUrl)
            connection.setRequestProperty("Accept", "application/octet-stream")
            try {
                checkResponse(connection)
                val length = connection.contentLengthLong
                if (length >= 0 && release.size >= 0 && length != release.size) {
                    throw IOException("下载长度与发行资产不符，请重试")
                }
                val expectedDigest = release.digest?.let {
                    if (!it.matches(Regex("sha256:[0-9a-fA-F]{64}"))) throw IOException("不支持的发行资产摘要")
                    it.substringAfter(':')
                }
                val hash = MessageDigest.getInstance("SHA-256")
                var received = 0L
                val total = if (release.size >= 0) release.size else length
                connection.inputStream.use { input ->
                    partial.outputStream().use { output ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            checkCancelled(cancelled)
                            val count = input.read(buffer)
                            if (count < 0) break
                            received += count
                            if ((release.size >= 0 && received > release.size) || (length >= 0 && received > length)) {
                                throw IOException("下载数据超过发行资产长度")
                            }
                            output.write(buffer, 0, count)
                            hash.update(buffer, 0, count)
                            progress(received, total)
                        }
                    }
                }
                checkCancelled(cancelled)
                if ((length >= 0 && received != length) || (release.size >= 0 && received != release.size)) {
                    throw IOException("下载不完整，请重试")
                }
                val actualDigest = hash.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
                if (expectedDigest != null && !actualDigest.equals(expectedDigest, ignoreCase = true)) {
                    throw IOException("SHA-256 校验失败，请重试")
                }
                completed = true
                return partial
            } finally {
                connection.disconnect()
            }
        } finally {
            if (!completed) partial.delete()
        }
    }

    private fun connection(address: String): HttpURLConnection {
        val url = URL(address)
        if (url.protocol != "https") throw IOException("发行下载必须使用 HTTPS")
        return connect(url).apply {
            connectTimeout = 15_000
            readTimeout = 15_000
            instanceFollowRedirects = true
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("User-Agent", "tModLoader-Mobile-Launcher")
            setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
            setRequestProperty("Accept-Encoding", "identity")
        }
    }

    private fun checkResponse(connection: HttpURLConnection) {
        val code = connection.responseCode
        if (connection.url.protocol != "https") throw IOException("拒绝非 HTTPS 重定向")
        if (code == 403 || code == 429) throw IOException("GitHub 请求受限，请稍后重试；仍可导入本地 ZIP")
        if (code !in 200..299) throw IOException("GitHub 请求失败（HTTP $code），请重试")
    }

    companion object {
        const val PAGE_SIZE = 30

        fun parsePage(body: String): TmlReleasePage {
            val array = JSONArray(body)
            val releases = mutableListOf<TmlRelease>()
            for (i in 0 until array.length()) {
                val item = array.optJSONObject(i) ?: continue
                if (item.optBoolean("draft", false)) continue
                val assets = item.optJSONArray("assets") ?: continue
                for (a in 0 until assets.length()) {
                    val asset = assets.optJSONObject(a) ?: continue
                    if (asset.optString("name") != "tModLoader.zip") continue
                    val url = asset.optString("browser_download_url")
                    val tag = item.optString("tag_name")
                    if (tag.isBlank() || !url.startsWith("https://")) continue
                    releases += TmlRelease(
                        item.optLong("id"), tag, item.optString("name").ifBlank { tag },
                        item.optBoolean("prerelease", false), url, asset.optLong("size", -1),
                        if (asset.isNull("digest")) null else asset.optString("digest").takeIf { it.isNotBlank() }
                    )
                    break
                }
            }
            return TmlReleasePage(releases, array.length() == PAGE_SIZE)
        }

        private fun checkCancelled(cancelled: () -> Boolean) {
            if (cancelled() || Thread.currentThread().isInterrupted) throw InterruptedIOException("已取消")
        }
    }
}
