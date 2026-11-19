package dev.tml.mobilelauncher.feature.renderers

import org.json.JSONObject

data class RendererPluginLibrary(
    val fileName: String,
    val assetPath: String,
    val sha256: String,
)

data class RendererPlugin(
    val packageName: String,
    val packageVersionName: String?,
    val packageVersionCode: Long,
    val rendererId: String,
    val displayName: String,
    val description: String,
    val backend: RendererBackend,
    val minAndroidApi: Int,
    val abis: Set<String>,
    val libraries: List<RendererPluginLibrary>,
) {
    val identity: String
        get() = "$packageName:$rendererId"
}

data class RendererPluginParseResult(
    val plugins: List<RendererPlugin>,
    val diagnostics: List<String>,
)

object RendererPluginDescriptorParser {
    private val rendererIdPattern = Regex("^[a-z0-9][a-z0-9._-]{0,63}$")
    private val sha256Pattern = Regex("^[0-9a-f]{64}$")
    private val abiAllowlist = setOf("arm64-v8a", "armeabi-v7a", "x86", "x86_64")

    fun parse(
        packageName: String,
        packageVersionName: String?,
        packageVersionCode: Long,
        json: JSONObject,
    ): RendererPluginParseResult {
        require(json.optInt("protocolVersion", -1) == 1) { "Unsupported renderer protocol version" }
        val renderers = json.optJSONArray("renderers") ?: error("Missing renderers array")
        val plugins = mutableListOf<RendererPlugin>()
        val diagnostics = mutableListOf<String>()
        val seenIds = mutableSetOf<String>()

        for (index in 0 until renderers.length()) {
            val raw = renderers.optJSONObject(index)
            if (raw == null) {
                diagnostics += "Renderer entry $index is not an object"
                continue
            }
            val id = raw.optString("id")
            if (id in seenIds) {
                diagnostics += "Renderer entry $index duplicates id '$id'"
                continue
            }
            if (id.isNotEmpty()) seenIds += id
            runCatching { parseEntry(packageName, packageVersionName, packageVersionCode, raw) }
                .onSuccess(plugins::add)
                .onFailure { diagnostics += "Renderer '$id': ${it.message ?: "invalid entry"}" }
        }
        return RendererPluginParseResult(plugins, diagnostics)
    }

    private fun parseEntry(
        packageName: String,
        packageVersionName: String?,
        packageVersionCode: Long,
        raw: JSONObject,
    ): RendererPlugin {
        val id = raw.getString("id")
        require(rendererIdPattern.matches(id)) { "invalid renderer id" }
        val name = raw.getString("displayName").trim()
        require(name.isNotEmpty() && name.length <= 80) { "invalid display name" }
        val description = raw.optString("description", "").trim()
        require(description.length <= 500) { "description is too long" }
        val backend = RendererBackend.fromId(raw.getString("backend")) ?: error("unsupported backend")
        val minApi = raw.getInt("minAndroidApi")
        require(minApi >= 28) { "minimum Android API must be at least 28" }

        val abiArray = raw.getJSONArray("abis")
        val abis = (0 until abiArray.length()).map { abiArray.getString(it) }.toSet()
        require(abis.isNotEmpty() && abis.all { it in abiAllowlist }) { "invalid ABI list" }

        val libraryArray = raw.getJSONArray("libraries")
        val libraries = (0 until libraryArray.length()).map { index ->
            val lib = libraryArray.getJSONObject(index)
            val fileName = lib.getString("fileName")
            val assetPath = lib.getString("assetPath")
            val digest = lib.getString("sha256")
            require(fileName in backend.requiredLibraries) { "unexpected library '$fileName'" }
            require(sha256Pattern.matches(digest)) { "SHA-256 must be lowercase hexadecimal" }
            val segments = assetPath.split('/')
            require(assetPath.startsWith("tml-renderer/") && segments.none { it.isEmpty() || it == "." || it == ".." }) {
                "invalid asset path"
            }
            RendererPluginLibrary(fileName, assetPath, digest)
        }
        require(libraries.map { it.fileName }.toSet() == backend.requiredLibraries &&
            libraries.size == backend.requiredLibraries.size) { "required library set does not match backend" }
        require(libraries.map { it.assetPath }.toSet().size == libraries.size) { "duplicate asset path" }

        return RendererPlugin(
            packageName, packageVersionName, packageVersionCode, id, name, description,
            backend, minApi, abis, libraries,
        )
    }
}
