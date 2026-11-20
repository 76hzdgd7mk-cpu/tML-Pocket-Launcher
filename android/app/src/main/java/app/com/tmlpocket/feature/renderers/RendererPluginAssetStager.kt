package app.com.tmlpocket.feature.renderers

import java.io.File
import java.io.InputStream
import java.security.MessageDigest

data class StagedRenderer(
    val identity: String,
    val backend: RendererBackend,
    val libraryDirectory: File,
)

class RendererPluginAssetStager(private val root: File) {
    fun stage(plugin: RendererPlugin, openAsset: (String) -> InputStream): StagedRenderer {
        val versionDirectory = File(root, "${plugin.packageName}/${plugin.packageVersionCode}/${plugin.rendererId}")
        val target = File(versionDirectory, plugin.descriptorDigest())
        versionDirectory.mkdirs()
        if (target.isDirectory && plugin.libraries.all { library ->
                val cached = File(target, library.fileName)
                cached.isFile && sha256(cached.readBytes()) == library.sha256
            }) {
            return StagedRenderer(plugin.identity, plugin.backend, target)
        }
        if (target.exists()) target.deleteRecursively()

        val temporary = File(versionDirectory, ".stage-${System.nanoTime()}")
        require(temporary.mkdir()) { "Unable to create renderer staging directory" }
        try {
            plugin.libraries.forEach { library ->
                val output = File(temporary, library.fileName)
                val digest = MessageDigest.getInstance("SHA-256")
                openAsset(library.assetPath).use { input ->
                    output.outputStream().buffered().use { stream ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            digest.update(buffer, 0, count)
                            stream.write(buffer, 0, count)
                        }
                    }
                }
                val actual = digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
                require(actual == library.sha256) { "SHA-256 mismatch for ${library.fileName}" }
            }
            if (!target.exists()) require(temporary.renameTo(target)) { "Unable to publish renderer libraries" }
            return StagedRenderer(plugin.identity, plugin.backend, target)
        } catch (failure: Throwable) {
            temporary.deleteRecursively()
            throw failure
        }
    }

    private fun RendererPlugin.descriptorDigest(): String {
        val digest = MessageDigest.getInstance("SHA-256")
        libraries.sortedBy { it.fileName }.forEach {
            digest.update(it.fileName.toByteArray())
            digest.update(it.assetPath.toByteArray())
            digest.update(it.sha256.toByteArray())
        }
        return digest.digest().take(12).joinToString("") { "%02x".format(it) }
    }

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes).joinToString("") { "%02x".format(it.toInt() and 0xff) }
}
