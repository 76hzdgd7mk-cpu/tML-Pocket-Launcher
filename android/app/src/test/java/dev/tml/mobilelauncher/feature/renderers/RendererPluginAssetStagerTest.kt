package dev.tml.mobilelauncher.feature.renderers

import java.io.ByteArrayInputStream
import java.io.File
import java.security.MessageDigest
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class RendererPluginAssetStagerTest {
    @get:Rule val temporary = TemporaryFolder()

    @Test
    fun stagesOnlyDigestVerifiedLibraries() {
        val bytes = "gl4es-library".toByteArray()
        val staged = RendererPluginAssetStager(temporary.root)
            .stage(plugin(sha256(bytes)), { ByteArrayInputStream(bytes) })

        assertArrayEquals(bytes, File(staged.libraryDirectory, "libGL_gl4es.so").readBytes())
        assertTrue(File(staged.libraryDirectory, "libEGL_gl4es.so").isFile)
    }

    @Test
    fun digestFailureDoesNotPublishUsableDirectory() {
        val bytes = "bad-library".toByteArray()
        val root = temporary.newFolder("renderer-root")
        val result = runCatching {
            RendererPluginAssetStager(root).stage(plugin("0".repeat(64)), { ByteArrayInputStream(bytes) })
        }
        assertTrue(result.isFailure)
        assertFalse(root.walkTopDown().any { it.isDirectory && it.name.matches(Regex("[a-f0-9]{24}")) })
        assertTrue(root.walkTopDown().none { it.name.startsWith(".stage-") })
    }

    private fun plugin(digest: String) = RendererPlugin(
        "dev.example.renderer", "1", 1L, "gl4es", "GL4ES", "", RendererBackend.GL4ES,
        28, setOf("arm64-v8a"), listOf(
            RendererPluginLibrary("libGL_gl4es.so", "tml-renderer/arm64-v8a/libGL_gl4es.so", digest),
            RendererPluginLibrary("libEGL_gl4es.so", "tml-renderer/arm64-v8a/libEGL_gl4es.so", digest),
        ),
    )

    private fun sha256(bytes: ByteArray) = MessageDigest.getInstance("SHA-256")
        .digest(bytes).joinToString("") { "%02x".format(it.toInt() and 0xff) }
}
