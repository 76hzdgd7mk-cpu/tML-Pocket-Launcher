package app.com.tmlpocket.feature.renderers

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RendererLaunchEnvironmentTest {
    @Test
    fun nativeLeavesPluginVariablesUnset() {
        assertTrue(RendererLaunchEnvironment.forRenderer(null).isEmpty())
    }

    @Test
    fun gl4esUsesSdlRendererNameAndStagedLibraryDirectory() {
        val environment = RendererLaunchEnvironment.forRenderer(
            StagedRenderer("dev.example.renderer:gl4es", RendererBackend.GL4ES, File("C:/app/files/renderers/example/12/gl4es")),
        )
        assertEquals("gl4es", environment["FNA3D_OPENGL_DRIVER"])
        assertEquals(File("C:/app/files/renderers/example/12/gl4es").absolutePath, environment["RALCORE_NATIVEDIR"])
        assertEquals("glsl120", environment["FNA3D_MOJOSHADER_PROFILE"])
        assertTrue("RALCORE_RENDERER" !in environment)
    }
}
