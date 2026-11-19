package dev.tml.mobilelauncher.feature.renderers

object RendererLaunchEnvironment {
    fun forRenderer(renderer: StagedRenderer?): Map<String, String> =
        if (renderer == null) emptyMap()
        else buildMap {
            put("FNA3D_OPENGL_DRIVER", renderer.backend.id)
            put("RALCORE_NATIVEDIR", renderer.libraryDirectory.absolutePath)
            if (renderer.backend == RendererBackend.GL4ES) {
                put("FNA3D_MOJOSHADER_PROFILE", "glsl120")
            }
        }
}
