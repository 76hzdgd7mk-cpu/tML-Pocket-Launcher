package app.com.tmlpocket.feature.installation

import java.io.IOException
import java.util.Locale
import java.util.UUID
import org.json.JSONObject

/** Metadata only: filesystem validation and all durable writes belong to the installer. */
internal class TmlVersionCatalog(private val state: JSONObject) {
    val records: MutableMap<String, JSONObject> =
        state.optJSONObject(VERSIONS)?.let { versions ->
            versions.keys().asSequence().sorted().associateWith { id ->
                checkId(id)
                JSONObject(versions.getJSONObject(id).toString())
            }.toMutableMap()
        }
            ?: mutableMapOf<String, JSONObject>().apply {
                state.optJSONObject(PackageKind.TMODLOADER.name)?.let {
                    put(LEGACY_ID, JSONObject(it.toString()))
                }
            }

    var activeId: String? =
        if (state.has(VERSIONS)) {
            state.optString(ACTIVE).takeIf { it.isNotEmpty() }?.also {
                checkId(it)
                if (!records.containsKey(it)) throw IOException("当前 tML 版本记录不存在")
            }
        } else records.keys.singleOrNull()

    fun installId(version: String): String =
        records.entries.firstOrNull {
            version != PackageVersionReader.UNKNOWN_TML &&
                normalizedVersion(it.value.getString("version")) == normalizedVersion(version)
        }?.key ?: if (records.isEmpty()) LEGACY_ID else UUID.randomUUID().toString()

    fun requireRecord(id: String): JSONObject {
        checkId(id)
        return records[id] ?: throw IOException("所选 tML 版本不存在，请刷新版本列表")
    }

    fun persist() {
        state.put(VERSIONS, JSONObject(records))
        val selected = activeId?.let(::requireRecord)
        if (selected == null) {
            state.remove(ACTIVE)
            state.remove(PackageKind.TMODLOADER.name)
        } else {
            state.put(ACTIVE, activeId)
            // Preserve the previous snapshot/manifest field for older launch consumers.
            state.put(PackageKind.TMODLOADER.name, JSONObject(selected.toString()))
        }
    }

    companion object {
        const val LEGACY_ID = "legacy"
        const val VERSIONS = "_tmlVersions"
        const val ACTIVE = "_activeTmlVersion"

        fun checkId(id: String) {
            if (id == LEGACY_ID) return
            if (runCatching { UUID.fromString(id).toString() == id }.getOrDefault(false)) return
            throw IOException("无效的 tML 版本标识")
        }

        private fun normalizedVersion(version: String) =
            version.trim().lowercase(Locale.ROOT).removePrefix("v").split('.').joinToString(".") {
                it.toIntOrNull()?.toString() ?: it
            }
    }
}
