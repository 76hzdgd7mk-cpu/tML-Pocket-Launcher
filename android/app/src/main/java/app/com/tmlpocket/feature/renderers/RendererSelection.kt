package app.com.tmlpocket.feature.renderers

object RendererSelection {
    const val VULKAN = "vulkan"
    private val identityPattern = Regex("^[A-Za-z0-9_]+(?:\\.[A-Za-z0-9_]+)+:[a-z0-9][a-z0-9._-]{0,63}$")

    fun isValidIdentity(identity: String): Boolean =
        identity == "native" || identity == VULKAN || identityPattern.matches(identity)

    fun isAvailable(identity: String, compatibleIdentities: Set<String>): Boolean =
        identity == "native" || identity == VULKAN ||
            (isValidIdentity(identity) && identity in compatibleIdentities)
}
