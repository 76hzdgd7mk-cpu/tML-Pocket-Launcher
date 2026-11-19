package dev.tml.mobilelauncher.feature.renderers

import java.io.ByteArrayInputStream
import java.io.File
import java.security.MessageDigest
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class RendererPluginRepositoryTest {
    @get:Rule val temporary = TemporaryFolder()

    @Test
    fun discoverKeepsCompatiblePluginAndSkipsUnsupportedSibling() {
        val bytes = "library".toByteArray()
        val source = FakeSource(listOf(
            packageEntry("dev.example.renderer", bytes, "arm64-v8a", 28),
            packageEntry("dev.example.oldrenderer", bytes, "x86", 28),
            packageEntry("dev.example.apirenderer", bytes, "arm64-v8a", 99),
        ))
        val catalog = repository(source).discover()
        assertEquals(listOf("dev.example.renderer:gl4es"), catalog.options.map { it.identity })
        assertTrue(catalog.diagnostics.size >= 2)
    }

    @Test
    fun malformedPackageDoesNotHideValidPackage() {
        val bytes = "library".toByteArray()
        val valid = packageEntry("dev.example.renderer", bytes, "arm64-v8a", 28)
        val broken = InstalledRendererPackage("dev.example.broken", "1", 1L) {
            ByteArrayInputStream("not-json".toByteArray())
        }
        val catalog = repository(FakeSource(listOf(broken, valid))).discover()
        assertEquals("dev.example.renderer:gl4es", catalog.options.single().identity)
        assertEquals(1, catalog.diagnostics.size)
    }

    @Test
    fun digestMismatchMakesPluginUnavailable() {
        val bad = packageEntry("dev.example.renderer", "different".toByteArray(), "arm64-v8a", 28, "0".repeat(64))
        val catalog = repository(FakeSource(listOf(bad))).discover()
        assertTrue(catalog.options.isEmpty())
        assertTrue(catalog.diagnostics.any { it.contains("SHA-256") })
    }

    private fun repository(source: FakeSource) = RendererPluginRepository(
        source, RendererPluginAssetStager(temporary.newFolder()), 35, listOf("arm64-v8a"),
    )

    private fun packageEntry(packageName: String, bytes: ByteArray, abi: String, minApi: Int, digestOverride: String? = null): InstalledRendererPackage {
        val digest = digestOverride ?: MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 0xff) }
        val descriptor = JSONObject().put("protocolVersion", 1).put("renderers", JSONArray().put(
            JSONObject().put("id", "gl4es").put("displayName", "GL4ES").put("backend", "gl4es")
                .put("minAndroidApi", minApi).put("abis", JSONArray().put(abi))
                .put("libraries", JSONArray()
                    .put(library("libGL_gl4es.so", abi, digest))
                    .put(library("libEGL_gl4es.so", abi, digest))),
        ))
        return InstalledRendererPackage(packageName, "1", 1L) { path ->
            if (path.endsWith("manifest.json")) ByteArrayInputStream(descriptor.toString().toByteArray())
            else ByteArrayInputStream(bytes)
        }
    }

    private fun library(name: String, abi: String, digest: String) = JSONObject()
        .put("fileName", name).put("assetPath", "tml-renderer/$abi/$name").put("sha256", digest)

    private class FakeSource(private val packages: List<InstalledRendererPackage>) : RendererPluginPackageSource {
        override fun queryInstalled() = packages
    }
}
