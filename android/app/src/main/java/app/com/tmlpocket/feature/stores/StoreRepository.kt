package app.com.tmlpocket.feature.stores

import android.content.Context
import java.io.File
import org.json.JSONObject

internal class StoreRepository(private val context: Context) {
    private val credentials = StoreCredentials(context)
    private var attemptedRestore = false

    fun onResume() {
        if (attemptedRestore) StoreRuntime.request(context, "steam.resume")
    }

    fun request(
        method: String,
        params: JSONObject,
        cancelled: () -> Boolean = { false },
        progress: (String, Int) -> Unit = { _, _ -> },
    ): Any {
        if (method == "status" && !attemptedRestore) {
            attemptedRestore = true
            credentials.read("steam")?.let {
                runCatching { StoreRuntime.request(context, "steam.login", it) }
            }
            credentials.read("gog")?.let {
                runCatching { StoreRuntime.request(context, "gog.restore", it) }
            }
        }
        val result = StoreRuntime.request(context, method, params, cancelled, progress)
        if (method.endsWith("logout")) credentials.clear(method.substringBefore('.'))
        return sanitize(result)
    }

    private fun sanitize(value: Any): Any {
        if (value is JSONObject) {
            for (platform in listOf("steam", "gog")) {
                value.optJSONObject(platform)?.let {
                    it.optJSONObject("credentials")?.let { token ->
                        credentials.save(platform, token)
                    }
                    it.remove("credentials")
                }
            }
            // A direct GOG login response also contains a private refresh token.
            value.optJSONObject("credentials")?.let { credentials.save("gog", it) }
            value.remove("credentials")
        }
        return value
    }

    fun downloadedArchive(result: Any): File {
        val path = (result as JSONObject).getString("archive")
        val root = File(context.cacheDir, "store-downloads").canonicalFile
        val file = File(path).canonicalFile
        require(file.parentFile == root && file.extension == "zip" && file.isFile) { "商店下载路径无效" }
        return file
    }

    fun importGog(file: File, cancelled: () -> Boolean, progress: (String, Int) -> Unit): File {
        val root = File(context.cacheDir, "store-downloads").apply { mkdirs() }
        val input = File(root, "import-${java.util.UUID.randomUUID()}.sh")
        java.nio.file.Files.move(file.toPath(), input.toPath())
        return try {
            downloadedArchive(
                request("gog.import", JSONObject().put("file", input.name), cancelled, progress)
            )
        } finally {
            input.delete()
        }
    }
}
