package app.com.tmlpocket.feature.renderers

enum class RendererBackend(
    val id: String,
    val requiredLibraries: Set<String>,
) {
    GL4ES("gl4es", setOf("libGL_gl4es.so", "libEGL_gl4es.so")),
    ANGLE("angle", setOf("libGLESv2_angle.so", "libEGL_angle.so")),
    MOBILEGLUES("mobileglues", setOf("libmobileglues.so"));

    companion object {
        fun fromId(value: String): RendererBackend? = entries.firstOrNull { it.id == value }
    }
}
