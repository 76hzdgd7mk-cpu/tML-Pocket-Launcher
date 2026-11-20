package app.com.tmlpocket.feature.stores

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONArray
import org.json.JSONObject

/** Public store metadata is independent of authenticated CM sessions and downloads. */
internal class SteamGameDetailsClient(
    private val directory: File,
    private val connect: (URL) -> HttpURLConnection = { it.openConnection() as HttpURLConnection },
    private val artwork: (ByteArray) -> String = SteamArtwork::encode,
    private val now: () -> Long = System::currentTimeMillis,
) {
    @Synchronized
    fun details(force: Boolean = false): JSONObject {
        val cached = readCache()
        if (!force && cached != null && now() - cached.getLong("fetchedAt") in 0 until CACHE_AGE)
            return cached.put("cached", true).put("stale", false)
        try {
            val raw = fetch(URL(DETAILS_URL), false).toString(Charsets.UTF_8)
            val result = parse(raw).put("fetchedAt", now()).put("cached", false).put("stale", false)
            val source = result.optString("headerUrl")
            val previous =
                cached?.takeIf { it.optString("headerUrl") == source }?.optString("headerImage")
            val image =
                if (source.isNotEmpty())
                    runCatching { artwork(fetch(URL(source), true)) }.getOrNull()
                else null
            result.put("headerImage", image ?: previous ?: "")
            runCatching {
                directory.mkdirs()
                val target = File(directory, "terraria.json")
                val temporary = File(directory, "terraria.tmp")
                temporary.writeText(result.toString())
                try {
                    java.nio.file.Files.move(
                        temporary.toPath(),
                        target.toPath(),
                        java.nio.file.StandardCopyOption.ATOMIC_MOVE,
                        java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                    )
                } catch (_: java.nio.file.AtomicMoveNotSupportedException) {
                    java.nio.file.Files.move(
                        temporary.toPath(),
                        target.toPath(),
                        java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                    )
                }
            }
            return result
        } catch (_: Exception) {
            if (cached != null) return cached.put("cached", true).put("stale", true)
            throw IOException("暂时无法读取 Steam 游戏详情，请检查网络后重试")
        }
    }

    private fun readCache(): JSONObject? =
        runCatching {
                val file = File(directory, "terraria.json")
                require(file.length() in 1..220_000)
                JSONObject(file.readText()).takeIf {
                    it.optInt("appId") == APP_ID &&
                        it.optString("name").isNotBlank() &&
                        it.optLong("fetchedAt") > 0 &&
                        it.optLong("fetchedAt") <= now() + 300_000 &&
                        (it.optString("headerImage").isEmpty() ||
                            it.optString("headerImage").startsWith("data:image/jpeg;base64,"))
                }
            }
            .getOrNull()

    private fun fetch(initial: URL, image: Boolean): ByteArray {
        var url = initial
        repeat(4) {
            require(
                if (image) allowedArtwork(url.toString())
                else
                    url.protocol == "https" &&
                        url.host == "store.steampowered.com" &&
                        url.path == "/api/appdetails" &&
                        url.userInfo == null &&
                        url.port in listOf(-1, 443)
            )
            val connection = connect(url)
            try {
                connection.instanceFollowRedirects = false
                connection.connectTimeout = 8_000
                connection.readTimeout = 8_000
                connection.setRequestProperty(
                    "Accept",
                    if (image) "image/jpeg,image/png,image/webp" else "application/json",
                )
                connection.setRequestProperty("User-Agent", "tModLoader-Mobile-Launcher")
                val status = connection.responseCode
                if (status in listOf(301, 302, 303, 307, 308)) {
                    url =
                        URL(
                            url,
                            connection.getHeaderField("Location")
                                ?: throw IOException("Steam 未返回跳转地址"),
                        )
                } else {
                    if (status != 200) throw IOException("Steam 商店暂时不可用")
                    if (
                        image &&
                            connection.contentType?.substringBefore(';') !in
                                listOf("image/jpeg", "image/png", "image/webp")
                    )
                        throw IOException("Steam 封面格式无效")
                    val limit = if (image) 2 * 1024 * 1024 else 1024 * 1024
                    if (connection.contentLengthLong > limit) throw IOException("Steam 详情过大")
                    return connection.inputStream.use { input ->
                        val output = ByteArrayOutputStream()
                        val buffer = ByteArray(8192)
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            if (output.size() + count > limit) throw IOException("Steam 详情过大")
                            output.write(buffer, 0, count)
                        }
                        output.toByteArray()
                    }
                }
            } finally {
                connection.disconnect()
            }
        }
        throw IOException("Steam 跳转次数过多")
    }

    companion object {
        const val APP_ID = 105600
        const val DETAILS_URL =
            "https://store.steampowered.com/api/appdetails?appids=105600&l=schinese&cc=us"
        private const val CACHE_AGE = 24 * 60 * 60 * 1000L
        private val artworkHosts =
            setOf(
                "shared.fastly.steamstatic.com",
                "shared.akamai.steamstatic.com",
                "cdn.akamai.steamstatic.com",
                "cdn.fastly.steamstatic.com",
                "steamcdn-a.akamaihd.net",
            )

        internal fun allowedArtwork(value: String): Boolean =
            runCatching {
                    val url = URL(value)
                    url.protocol == "https" &&
                        url.host in artworkHosts &&
                        url.port in listOf(-1, 443) &&
                        url.userInfo == null &&
                        listOf("/store_item_assets/steam/apps/$APP_ID/", "/steam/apps/$APP_ID/")
                            .any { url.path.startsWith(it) } &&
                        !url.path.contains("..") &&
                        !url.path.contains('%')
                }
                .getOrDefault(false)

        internal fun parse(raw: String): JSONObject {
            val app = JSONObject(raw).getJSONObject(APP_ID.toString())
            require(app.optBoolean("success")) { "Steam 未返回游戏详情" }
            val data = app.getJSONObject("data")
            require(data.optInt("steam_appid") == APP_ID && data.optString("type") == "game")
            val name = plain(data.optString("name"), 160)
            require(name.isNotBlank())
            val header = data.optString("header_image").takeIf(::allowedArtwork) ?: ""
            return JSONObject()
                .put("appId", APP_ID)
                .put("name", name)
                .put("description", plain(data.optString("short_description"), 2000))
                .put("developers", names(data.optJSONArray("developers")))
                .put("publishers", names(data.optJSONArray("publishers")))
                .put(
                    "genres",
                    JSONArray().apply {
                        val genres = data.optJSONArray("genres") ?: JSONArray()
                        for (index in 0 until minOf(genres.length(), 8)) {
                            val genre =
                                plain(
                                    genres.optJSONObject(index)?.optString("description") ?: "",
                                    80,
                                )
                            if (genre.isNotBlank()) put(genre)
                        }
                    },
                )
                .put(
                    "releaseDate",
                    plain(data.optJSONObject("release_date")?.optString("date") ?: "", 80),
                )
                .put("headerUrl", header)
                .put("storeUrl", "https://store.steampowered.com/app/$APP_ID/")
        }

        private fun names(items: JSONArray?): JSONArray =
            JSONArray().apply {
                if (items != null)
                    for (index in 0 until minOf(items.length(), 8)) {
                        val item = plain(items.optString(index), 160)
                        if (item.isNotBlank()) put(item)
                    }
            }

        private fun plain(value: String, max: Int): String {
            val stripped = value.take(20_000).replace(Regex("<[^>]*>"), " ")
            val decoded =
                Regex("&(#x[0-9a-fA-F]+|#[0-9]+|amp|quot|apos|lt|gt|nbsp);").replace(stripped) {
                    val token = it.groupValues[1]
                    when (token) {
                        "amp" -> "&"
                        "quot" -> "\""
                        "apos" -> "'"
                        "lt" -> "<"
                        "gt" -> ">"
                        "nbsp" -> " "
                        else ->
                            runCatching {
                                    val number =
                                        if (token.startsWith("#x")) token.drop(2).toInt(16)
                                        else token.drop(1).toInt()
                                    if (
                                        Character.isValidCodePoint(number) &&
                                            number !in 0xD800..0xDFFF
                                    )
                                        String(Character.toChars(number))
                                    else ""
                                }
                                .getOrDefault("")
                    }
                }
            return decoded.replace(Regex("\\s+"), " ").trim().take(max)
        }
    }
}
