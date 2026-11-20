package app.com.tmlpocket.feature.releases

import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InterruptedIOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class TmlReleaseClientTest {
    @get:Rule val temporary = TemporaryFolder()

    @Test fun parsesStableAndPreviewAndIgnoresDraftsAndMissingAssets() {
        val body = """[
          {"id":1,"tag_name":"v1","name":"Stable","assets":[{"name":"tModLoader.zip","browser_download_url":"https://example.test/stable","size":42,"digest":null}]},
          {"id":2,"tag_name":"v2","name":"","prerelease":true,"assets":[{"name":"other.zip"},{"name":"tModLoader.zip","browser_download_url":"https://example.test/preview","size":30,"digest":"sha256:abc"}]},
          {"id":3,"tag_name":"draft","draft":true,"assets":[{"name":"tModLoader.zip","browser_download_url":"https://example.test/draft"}]},
          {"id":4,"tag_name":"no-zip","assets":[{"name":"source.zip"}]},
          {"id":5,"tag_name":"unsafe","assets":[{"name":"tModLoader.zip","browser_download_url":"http://example.test/insecure"}]}
        ]"""
        val page = TmlReleaseClient.parsePage(body)
        assertEquals(listOf("v1", "v2"), page.releases.map { it.tag })
        assertFalse(page.releases[0].preview)
        assertNull(page.releases[0].digest)
        assertTrue(page.releases[1].preview)
        assertEquals("v2", page.releases[1].name)
        assertEquals("sha256:abc", page.releases[1].digest)
        assertFalse(page.hasMore)
    }

    @Test fun paginationUsesRawPageLengthEvenWhenEveryEntryIsFiltered() {
        val body = List(30) { """{"draft":true}""" }.joinToString(",", "[", "]")
        val page = TmlReleaseClient.parsePage(body)
        assertTrue(page.hasMore)
        assertTrue(page.releases.isEmpty())
    }

    @Test fun listRequestsExplicitPageAndGithubHeaders() {
        lateinit var connection: FakeConnection
        val client = TmlReleaseClient(connect = { url ->
            FakeConnection(url, "[]".toByteArray()).also { connection = it }
        })
        assertTrue(client.releases(2).releases.isEmpty())
        assertEquals("per_page=30&page=2", connection.url.query)
        assertEquals("2022-11-28", connection.getRequestProperty("X-GitHub-Api-Version"))
        assertEquals("application/vnd.github+json", connection.getRequestProperty("Accept"))
        assertNotNull(connection.getRequestProperty("User-Agent"))
        assertTrue(connection.disconnected)
    }

    @Test fun downloadsAndVerifiesSha256WithByteProgress() {
        val bytes = ByteArray(150_000) { (it % 251).toByte() }
        val hash = MessageDigest.getInstance("SHA-256").digest(bytes)
            .joinToString("") { "%02x".format(it.toInt() and 255) }
        val connection = FakeConnection(URL("https://example.test/zip"), bytes)
        val client = TmlReleaseClient(connect = { connection })
        val reports = mutableListOf<Pair<Long, Long>>()
        val output = client.download(release(bytes.size.toLong(), "sha256:$hash"), temporary.root,
            progress = { done, total -> reports += done to total })
        assertArrayEquals(bytes, output.readBytes())
        assertEquals(bytes.size.toLong() to bytes.size.toLong(), reports.last())
        assertTrue(reports.size >= 3)
        assertEquals("application/octet-stream", connection.getRequestProperty("Accept"))
        assertTrue(connection.disconnected)
    }

    @Test fun rejectsDigestMismatchAndDeletesPartial() {
        val connection = FakeConnection(URL("https://example.test/zip"), byteArrayOf(1, 2, 3))
        expectFailure<IOException> {
            TmlReleaseClient(connect = { connection }).download(release(3, "sha256:${"0".repeat(64)}"), temporary.root)
        }
        assertTrue(temporary.root.listFiles()!!.isEmpty())
        assertTrue(connection.disconnected)
    }

    @Test fun rejectsTruncatedBodyAndDeletesPartial() {
        val connection = FakeConnection(URL("https://example.test/zip"), byteArrayOf(1, 2, 3), declaredLength = 5)
        expectFailure<IOException> {
            TmlReleaseClient(connect = { connection }).download(release(5), temporary.root)
        }
        assertTrue(temporary.root.listFiles()!!.isEmpty())
    }

    @Test fun rejectsConflictingAssetLengthBeforeReading() {
        val connection = FakeConnection(URL("https://example.test/zip"), byteArrayOf(1, 2, 3))
        expectFailure<IOException> {
            TmlReleaseClient(connect = { connection }).download(release(4), temporary.root)
        }
        assertFalse(connection.streamOpened)
        assertTrue(temporary.root.listFiles()!!.isEmpty())
    }

    @Test fun cancellationDuringDownloadDeletesPartialAndDisconnects() {
        val bytes = ByteArray(150_000)
        val connection = FakeConnection(URL("https://example.test/zip"), bytes)
        var cancel = false
        expectFailure<InterruptedIOException> {
            TmlReleaseClient(connect = { connection }).download(release(bytes.size.toLong()), temporary.root,
                cancelled = { cancel }, progress = { _, _ -> cancel = true })
        }
        assertTrue(temporary.root.listFiles()!!.isEmpty())
        assertTrue(connection.disconnected)
    }

    @Test fun rejectsPlainHttpBeforeOpeningAConnection() {
        var opened = false
        expectFailure<IOException> {
            TmlReleaseClient(connect = { opened = true; FakeConnection(it, byteArrayOf()) })
                .download(release(0).copy(downloadUrl = "http://example.test/zip"), temporary.root)
        }
        assertFalse(opened)
        assertTrue(temporary.root.listFiles()!!.isEmpty())
    }

    @Test fun rateLimitIsAnActionableErrorAndDisconnects() {
        val connection = FakeConnection(URL("https://example.test/releases"), byteArrayOf(), code = 403)
        val failure = expectFailure<IOException> { TmlReleaseClient(connect = { connection }).releases(1) }
        assertTrue(failure.message!!.contains("导入本地 ZIP"))
        assertTrue(connection.disconnected)
    }

    private fun release(size: Long, digest: String? = null) =
        TmlRelease(1, "v1", "Version 1", false, "https://example.test/zip", size, digest)

    private inline fun <reified T : Throwable> expectFailure(action: () -> Unit): T {
        try {
            action()
        } catch (failure: Throwable) {
            if (failure is T) return failure
            throw failure
        }
        throw AssertionError("Expected ${T::class.java.simpleName}")
    }

    private class FakeConnection(
        url: URL,
        private val bytes: ByteArray,
        private val declaredLength: Long = bytes.size.toLong(),
        private val code: Int = 200
    ) : HttpURLConnection(url) {
        var disconnected = false
        var streamOpened = false
        override fun connect() = Unit
        override fun disconnect() { disconnected = true }
        override fun usingProxy() = false
        override fun getResponseCode() = code
        override fun getContentLengthLong() = declaredLength
        override fun getInputStream(): ByteArrayInputStream {
            streamOpened = true
            return ByteArrayInputStream(bytes)
        }
    }
}
