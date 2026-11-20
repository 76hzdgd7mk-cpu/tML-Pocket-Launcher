package app.com.tmlpocket.feature.renderers

import java.io.File
import java.security.MessageDigest
import org.json.JSONObject

data class RendererPluginOption(
    val identity: String,
    val packageName: String,
    val packageVersionName: String?,
    val rendererId: String,
    val displayName: String,
    val description: String,
    val backend: RendererBackend,
)

data class RendererPluginCatalog(
    val options: List<RendererPluginOption>,
    val diagnostics: List<String>,
)

class RendererPluginRepository(
    private val source: RendererPluginPackageSource,
    private val stager: RendererPluginAssetStager,
    private val sdkInt: Int,
    private val supportedAbis: List<String>,
) {
    private val plugins = linkedMapOf<String, RendererPlugin>()

    fun discover(): RendererPluginCatalog {
        val diagnostics = mutableListOf<String>()
        val discovered = linkedMapOf<String, RendererPlugin>()
        source.queryInstalled().forEach { installed ->
            runCatching {
                val descriptor = installed.openAsset(AndroidRendererPluginPackageSource.DESCRIPTOR_ASSET)
                    .bufferedReader().use { JSONObject(it.readText()) }
                RendererPluginDescriptorParser.parse(
                    installed.packageName, installed.versionName, installed.versionCode, descriptor,
                )
            }.onSuccess { parsed ->
                diagnostics += parsed.diagnostics.map { "${installed.packageName}: $it" }
                parsed.plugins.forEach { plugin ->
                    when {
                        plugin.minAndroidApi > sdkInt -> diagnostics += "${plugin.identity}: Android API is too old"
                        plugin.abis.none { it in supportedAbis } -> diagnostics += "${plugin.identity}: ABI is unsupported"
                        discovered.containsKey(plugin.identity) -> diagnostics += "${plugin.identity}: duplicate identity"
                        else -> {
                            if (plugin.libraries.any { lib ->
                                    plugin.abis.none { abi -> abi in supportedAbis && lib.assetPath.contains("/$abi/") }
                                }) {
                                diagnostics += "${plugin.identity}: library assets do not match device ABI"
                            } else {
                                val verification = verifyAssets(plugin, installed.openAsset)
                                if (verification.isSuccess) discovered[plugin.identity] = plugin
                                else diagnostics += "${plugin.identity}: asset verification failed: ${verification.exceptionOrNull()?.message}"
                            }
                        }
                    }
                }
            }.onFailure { diagnostics += "${installed.packageName}: ${it.message ?: "cannot read descriptor"}" }
        }
        plugins.clear()
        plugins.putAll(discovered)
        val options = discovered.values.map {
            RendererPluginOption(it.identity, it.packageName, it.packageVersionName, it.rendererId, it.displayName, it.description, it.backend)
        }
        return RendererPluginCatalog(options, diagnostics)
    }

    fun stage(identity: String): StagedRenderer {
        val catalog = discover()
        require(catalog.options.any { it.identity == identity }) { "Renderer plugin '$identity' is no longer compatible" }
        val plugin = plugins[identity] ?: error("Renderer plugin '$identity' disappeared")
        val installed = source.queryInstalled().firstOrNull { it.packageName == plugin.packageName }
            ?: error("Renderer package '${plugin.packageName}' is not installed")
        val descriptor = installed.openAsset(AndroidRendererPluginPackageSource.DESCRIPTOR_ASSET)
            .bufferedReader().use { JSONObject(it.readText()) }
        val fresh = RendererPluginDescriptorParser.parse(installed.packageName, installed.versionName, installed.versionCode, descriptor)
            .plugins.firstOrNull { it.identity == identity } ?: error("Renderer descriptor changed")
        require(fresh.minAndroidApi <= sdkInt && fresh.abis.any { it in supportedAbis }) {
            "Renderer plugin '$identity' is no longer compatible with this device"
        }
        require(fresh.libraries.all { library -> fresh.abis.any { abi -> abi in supportedAbis && library.assetPath.contains("/$abi/") } }) {
            "Renderer plugin '$identity' has no libraries for this device ABI"
        }
        return stager.stage(fresh, installed.openAsset)
    }

    private fun verifyAssets(plugin: RendererPlugin, openAsset: (String) -> java.io.InputStream): Result<Unit> = runCatching {
        plugin.libraries.forEach { library ->
            val digest = MessageDigest.getInstance("SHA-256")
            openAsset(library.assetPath).use { input ->
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    digest.update(buffer, 0, count)
                }
            }
            val actual = digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
            require(actual == library.sha256) { "SHA-256 mismatch for ${library.fileName}" }
        }
    }
}
