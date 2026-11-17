package dev.tml.mobilelauncher.feature.stores

import java.io.ByteArrayInputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class SteamGameDetailsClientTest {
    @get:Rule val temporary = TemporaryFolder()
    private val header =
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/105600/header.jpg?t=1"

    private fun response(image: String = header, id: Int = 105600) =
        """{"105600":{"success":true,"data":{"type":"game","steam_appid":$id,"name":"Terraria","short_description":"探索 &amp; 建造<br>与&#x597D;友一起","developers":["Re-Logic"],"publishers":["Re-Logic"],"header_image":"$image","genres":[{"description":"冒险"}],"release_date":{"date":"2011 年 5 月 16 日"}}}}"""

    @Test
    fun readsOfficialFieldsAsPlainText() {
        val result = SteamGameDetailsClient.parse(response())
        assertEquals("Terraria", result.getString("name"))
        assertEquals("探索 & 建造 与好友一起", result.getString("description"))
        assertEquals("Re-Logic", result.getJSONArray("developers").getString(0))
        assertEquals("冒险", result.getJSONArray("genres").getString(0))
        assertEquals(header, result.getString("headerUrl"))
    }

    @Test
    fun rejectsMissingAndUnrelatedApps() {
        for (raw in listOf("{}", """{"105600":{"success":false}}""", response(id = 999))) {
            assertThrows(Exception::class.java) { SteamGameDetailsClient.parse(raw) }
        }
    }

    @Test
    fun onlyAcceptsTerrariaArtworkOnHttpsSteamCdn() {
        assertTrue(SteamGameDetailsClient.allowedArtwork(header))
        for (url in
            listOf(
                "http://shared.fastly.steamstatic.com/steam/apps/105600/header.jpg",
                "https://evil.example/steam/apps/105600/header.jpg",
                "https://shared.fastly.steamstatic.com.evil.example/steam/apps/105600/header.jpg",
                "https://shared.fastly.steamstatic.com/steam/apps/999/header.jpg",
                "https://user@shared.fastly.steamstatic.com/steam/apps/105600/header.jpg",
                "https://shared.fastly.steamstatic.com/steam/apps/105600/../999/header.jpg",
                "https://shared.fastly.steamstatic.com/steam/apps/105600/%2e%2e/header.jpg",
            )) {
            assertFalse(url, SteamGameDetailsClient.allowedArtwork(url))
            assertEquals("", SteamGameDetailsClient.parse(response(url)).getString("headerUrl"))
        }
    }

    @Test
    fun freshCacheAvoidsNetworkAndRetainsArtwork() {
        var requests = 0
        val connections = mutableListOf<FakeConnection>()
        val client =
            SteamGameDetailsClient(
                temporary.newFolder(),
                connect = { url ->
                    requests++
                    FakeConnection(
                            url,
                            if (url.host == "store.steampowered.com") response().toByteArray()
                            else byteArrayOf(1),
                            if (url.host == "store.steampowered.com") "application/json"
                            else "image/jpeg",
                        )
                        .also { connections.add(it) }
                },
                artwork = { "data:image/jpeg;base64,fixture" },
            )
        val initial = client.details()
        assertFalse(initial.getBoolean("cached"))
        assertEquals("data:image/jpeg;base64,fixture", initial.getString("headerImage"))
        assertEquals(2, requests)
        assertTrue(client.details().getBoolean("cached"))
        assertEquals(2, requests)
        assertTrue(connections.all { it.disconnected })
        assertTrue(connections[0].url.query.contains("l=schinese"))
    }

    @Test
    fun offlineRefreshReturnsStaleCachedDetails() {
        var offline = false
        val client =
            SteamGameDetailsClient(
                temporary.newFolder(),
                connect = { url ->
                    if (offline) throw IOException("offline")
                    FakeConnection(url, response(image = "").toByteArray())
                },
            )
        client.details()
        offline = true
        val result = client.details(true)
        assertTrue(result.getBoolean("stale"))
        assertEquals("Terraria", result.getString("name"))
    }

    @Test
    fun expiryRefreshesMetadataAndNeverNeedsAccountCredentials() {
        var time = 1_000_000L
        var requests = 0
        val client =
            SteamGameDetailsClient(
                temporary.newFolder(),
                connect = { url ->
                    requests++
                    FakeConnection(url, response(image = "").toByteArray()).also {
                        assertNull(it.getRequestProperty("Authorization"))
                    }
                },
                now = { time },
            )
        client.details()
        time += 25 * 60 * 60 * 1000
        assertFalse(client.details().getBoolean("cached"))
        assertEquals(2, requests)
    }

    @Test
    fun imageFailureDoesNotHideGameDetails() {
        val client =
            SteamGameDetailsClient(
                temporary.newFolder(),
                connect = { url ->
                    if (url.host != "store.steampowered.com") throw IOException("image unavailable")
                    FakeConnection(url, response().toByteArray())
                },
            )
        val result = client.details()
        assertEquals("Terraria", result.getString("name"))
        assertEquals("", result.getString("headerImage"))
    }

    @Test
    fun rejectsOversizedResponsesAndUnsafeRedirects() {
        for (redirect in listOf(false, true)) {
            val client =
                SteamGameDetailsClient(
                    temporary.newFolder(),
                    connect = { url ->
                        FakeConnection(
                            url,
                            if (redirect) byteArrayOf() else ByteArray(1024 * 1024 + 1),
                            redirect = if (redirect) "http://127.0.0.1/metadata" else null,
                        )
                    },
                )
            assertThrows(IOException::class.java) { client.details() }
        }
    }

    @Test
    fun corruptCacheDoesNotPreventFreshMetadata() {
        val directory = temporary.newFolder()
        java.io.File(directory, "terraria.json").writeText("broken")
        val client =
            SteamGameDetailsClient(
                directory,
                connect = { url -> FakeConnection(url, response(image = "").toByteArray()) },
            )
        assertEquals("Terraria", client.details().getString("name"))
        assertEquals(
            105600,
            JSONObject(java.io.File(directory, "terraria.json").readText()).getInt("appId"),
        )
    }

    private class FakeConnection(
        url: URL,
        private val body: ByteArray,
        private val mime: String = "application/json",
        private val redirect: String? = null,
    ) : HttpURLConnection(url) {
        var disconnected = false

        override fun connect() {}

        override fun disconnect() {
            disconnected = true
        }

        override fun usingProxy() = false

        override fun getResponseCode() = if (redirect != null) 302 else 200

        override fun getContentLengthLong() = -1L

        override fun getContentType() = mime

        override fun getInputStream() = ByteArrayInputStream(body)

        override fun getHeaderField(name: String?) = if (name == "Location") redirect else null
    }
}
