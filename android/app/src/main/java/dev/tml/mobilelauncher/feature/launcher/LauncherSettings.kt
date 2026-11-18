package dev.tml.mobilelauncher.feature.launcher

import android.content.Context
import dev.tml.mobilelauncher.feature.mods.ModRepository.Companion.strings
import dev.tml.mobilelauncher.feature.patches.PatchRepository
import org.json.JSONArray
import org.json.JSONObject

class LauncherSettings(context: Context) {
    private val storage = context.getSharedPreferences("launcher-settings", Context.MODE_PRIVATE)

    fun read(): JSONObject =
        runCatching { JSONObject(storage.getString("preferences", "{}") ?: "{}") }
            .getOrDefault(JSONObject())

    fun save(patch: JSONObject): JSONObject {
        val result = read()
        for (key in patch.keys()) {
            val value = patch.get(key)
            when (key) {
                "theme" -> require(value in listOf("dark", "light", "system"))
                "orientation" -> require(value in listOf("landscape", "portrait"))
                "motion",
                "glassEffects",
                "touchEnabled",
                "wifiOnly" -> require(value is Boolean)
                "glass" -> require(value is Number && value.toInt() in 75..100)
                "touchOpacity" -> require(value is Number && value.toInt() in 20..100)
                "renderScale" -> require(value in listOf(50, 75, 100))
                "background" -> require(value in listOf("none", "diy", "custom"))
                "backgroundTint" ->
                    require(value is String && Regex("^#[0-9a-fA-F]{6}$").matches(value))
                "quickTools" ->
                    require(
                        value is JSONArray &&
                            value.length() == 4 &&
                            value.strings().toSet().size == 4 &&
                            value.strings().all {
                                it in
                                    setOf(
                                        "mods",
                                        "browse",
                                        "packs",
                                        "patches",
                                        "controls",
                                        "storage",
                                        "tasks",
                                        "accounts",
                                        "logs",
                                        "activity",
                                    )
                            }
                    )
                "launchArguments" -> {
                    require(value is JSONArray)
                    PatchRepository.validateArguments(value.strings())
                }
                else -> error("不支持的设置项：$key")
            }
            result.put(key, value)
        }
        storage.edit().putString("preferences", result.toString()).apply()
        return result
    }
}
