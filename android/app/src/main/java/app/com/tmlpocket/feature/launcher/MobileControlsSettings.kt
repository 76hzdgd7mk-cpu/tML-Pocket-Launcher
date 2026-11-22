package app.com.tmlpocket.feature.launcher

import app.com.tmlpocket.feature.mods.ModRepository
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.AtomicFile
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.security.MessageDigest
import org.json.JSONObject

internal class MobileControlsSettings(userData: File) {
    private val target = File(userData, "MobileControls.json")
    private val legacy = File(userData, "ModConfigs/MobileJoystick_MobileJoystickConfig.json")
    private val textures = File(userData, "ModConfigs/MobileJoystick/ControlPacks/Assets")

    fun texture(name: String): File? =
        if (name.matches(Regex("[0-9a-f]{64}\\.png"))) File(textures, name).takeIf { it.isFile } else null

    fun importTexture(input: InputStream): String {
        val bytes = ByteArrayOutputStream()
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            require(bytes.size() + count <= MAX_BYTES) { "控件贴图不能超过 2 MB" }
            bytes.write(buffer, 0, count)
        }
        val original = bytes.toByteArray()
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(original, 0, original.size, bounds)
        require(bounds.outMimeType == "image/png" && bounds.outWidth in 1..1024 && bounds.outHeight in 1..1024) {
            "请选择尺寸不超过 1024 × 1024 的 PNG"
        }
        val bitmap = BitmapFactory.decodeByteArray(original, 0, original.size)
            ?: error("读不到控件贴图")
        try {
            bytes.reset()
            check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, bytes)) { "控件贴图保存失败" }
        } finally {
            bitmap.recycle()
        }
        val png = bytes.toByteArray()
        val hash = MessageDigest.getInstance("SHA-256").digest(png).joinToString("") { "%02x".format(it) }
        val file = File(textures, "$hash.png")
        if (!file.isFile) {
            textures.mkdirs()
            val atomic = AtomicFile(file)
            val output = atomic.startWrite()
            try {
                output.write(png)
                atomic.finishWrite(output)
            } catch (error: Exception) {
                atomic.failWrite(output)
                throw error
            }
        }
        return hash
    }

    fun read(): JSONObject {
        val file = if (target.isFile) target else legacy
        if (!file.isFile) return JSONObject()
        require(file.length() <= MAX_BYTES) { "触控配置文件过大" }
        return JSONObject(file.readText().removePrefix("\uFEFF"))
    }

    fun save(value: JSONObject): JSONObject {
        val current = read()
        val category = value.getString("category")
        val changes = value.getJSONObject("settings")
        val allowed = when (category) {
            "controls" -> CONTROL_FIELDS
            "interface" -> INTERFACE_FIELDS
            "layout" -> CONTROL_FIELDS + INTERFACE_FIELDS
            else -> error("未知的触控设置类别")
        }
        require(changes.keys().asSequence().all { it in allowed }) { "触控设置字段无效" }
        changes.keys().forEach { key -> current.put(key, changes.get(key)) }
        val json = current.toString(2)
        require(json.toByteArray(Charsets.UTF_8).size <= MAX_BYTES) { "触控配置文件过大" }
        ModRepository.write(target, json)
        return current
    }

    companion object {
        private const val MAX_BYTES = 2 * 1024 * 1024
        private val CONTROL_FIELDS = setOf(
            "ControlLayout", "ActiveCustomPresetIndex", "CustomPresets", "ControlScale",
            "LeftStickOffsetX", "LeftStickOffsetY", "RightStickOffsetX", "RightStickOffsetY",
            "Opacity", "JoystickDeadzone", "JoystickUpJumps", "EnablePinchZoom", "ShowTopButtons",
            "EnableTouchInput", "HideGameControls",
        )
        private val INTERFACE_FIELDS = setOf("UIFontScale", "HotbarOrientation", "InterfaceLayout", "EdgePadding")
    }
}
