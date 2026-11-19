package dev.tml.mobilelauncher.feature.renderers

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RendererPluginDescriptorTest {
    @Test
    fun validGl4esEntryHasPackageScopedIdentityAndFixedLibraries() {
        val result = RendererPluginDescriptorParser.parse(
            "dev.example.renderer", "1.2", 12L, validManifest(),
        )
        assertEquals(emptyList<String>(), result.diagnostics)
        assertEquals("dev.example.renderer:gl4es", result.plugins.single().identity)
        assertEquals("1.2", result.plugins.single().packageVersionName)
        assertEquals(setOf("libGL_gl4es.so", "libEGL_gl4es.so"), result.plugins.single().libraries.map { it.fileName }.toSet())
    }

    @Test
    fun rejectsUnknownProtocolVersion() {
        val error = runCatching {
            RendererPluginDescriptorParser.parse("dev.example.renderer", null, 1, validManifest().put("protocolVersion", 2))
        }.exceptionOrNull()
        assertTrue(error?.message.orEmpty().contains("protocol"))
    }

    @Test
    fun invalidEntryDoesNotSuppressValidSibling() {
        val manifest = validManifest().getJSONArray("renderers")
        manifest.put(entry().put("backend", "vulkan"))
        val result = RendererPluginDescriptorParser.parse("dev.example.renderer", null, 1, JSONObject().put("protocolVersion", 1).put("renderers", manifest))
        assertEquals(1, result.plugins.size)
        assertEquals(1, result.diagnostics.size)
    }

    @Test
    fun rejectsTraversalAndWrongLibrarySet() {
        for (bad in listOf(
            entry().getJSONArray("libraries").getJSONObject(0).put("assetPath", "tml-renderer/../escape.so").let { entry().put("libraries", JSONArray().put(it).put(library("libEGL_gl4es.so"))) },
            entry().put("libraries", JSONArray().put(library("libGL_wrong.so"))),
        )) {
            val result = RendererPluginDescriptorParser.parse("dev.example.renderer", null, 1, JSONObject().put("protocolVersion", 1).put("renderers", JSONArray().put(bad)))
            assertTrue(result.plugins.isEmpty())
        }
    }

    private fun validManifest() = JSONObject().put("protocolVersion", 1).put("renderers", JSONArray().put(entry()))

    private fun entry() = JSONObject()
        .put("id", "gl4es")
        .put("displayName", "GL4ES")
        .put("description", "OpenGL compatibility renderer")
        .put("backend", "gl4es")
        .put("minAndroidApi", 28)
        .put("abis", JSONArray().put("arm64-v8a"))
        .put("libraries", JSONArray().put(library("libGL_gl4es.so")).put(library("libEGL_gl4es.so")))

    private fun library(name: String) = JSONObject()
        .put("fileName", name)
        .put("assetPath", "tml-renderer/arm64-v8a/$name")
        .put("sha256", "a".repeat(64))
}
