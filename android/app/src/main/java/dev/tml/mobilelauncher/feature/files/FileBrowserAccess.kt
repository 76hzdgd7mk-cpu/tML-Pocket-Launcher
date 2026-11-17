package dev.tml.mobilelauncher.feature.files

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Environment
import android.util.Base64
import java.io.ByteArrayOutputStream
import org.json.JSONObject

internal class FileBrowserAccess(private val context: Context) {
    fun granted(): Boolean =
        if (Build.VERSION.SDK_INT >= 30) Environment.isExternalStorageManager()
        else
            context.checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) ==
                PackageManager.PERMISSION_GRANTED &&
                context.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) ==
                    PackageManager.PERMISSION_GRANTED

    private fun availableRoots(): List<BrowserRoot> = buildList {
        context.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS)?.let {
            if (it.isDirectory || it.mkdirs()) add(BrowserRoot("launcher", "启动器文件", it))
        }
        if (granted()) {
            @Suppress("DEPRECATION") val primary = Environment.getExternalStorageDirectory()
            if (primary.isDirectory) add(BrowserRoot("storage", "内部存储", primary, true))
            context.getExternalFilesDirs(null).filterNotNull().forEachIndexed { index, file ->
                if (Environment.isExternalStorageRemovable(file)) {
                    val volume = file.parentFile?.parentFile?.parentFile?.parentFile
                    if (volume?.isDirectory == true)
                        add(BrowserRoot("volume-$index", "外部存储 ${index + 1}", volume, true))
                }
            }
        }
    }

    fun repository() = FileBrowserRepository(availableRoots())

    fun status(): JSONObject =
        JSONObject()
            .put("granted", granted())
            .put("roots", repository().roots())
            .put("restricted", "Android/data 与 Android/obb 受系统保护，请将导入文件放到 Download 或 Documents。")

    fun image(params: JSONObject): JSONObject {
        val file = repository().selection("image", org.json.JSONArray().put(params)).single()
        require(file.length() in 1..10L * 1024 * 1024) { "请选择 10 MB 以内的图片" }
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, options)
        require(
            options.outWidth in 1..16384 &&
                options.outHeight in 1..16384 &&
                options.outWidth.toLong() * options.outHeight <= 64_000_000
        ) {
            "图片尺寸过大或格式无效"
        }
        options.inSampleSize = 1
        while (maxOf(options.outWidth, options.outHeight) / options.inSampleSize > 1600) options
            .inSampleSize *= 2
        options.inJustDecodeBounds = false
        val bitmap = BitmapFactory.decodeFile(file.absolutePath, options) ?: error("无法解码图片")
        val bytes =
            try {
                ByteArrayOutputStream().use { output ->
                    check(bitmap.compress(Bitmap.CompressFormat.JPEG, 82, output)) { "无法处理图片" }
                    require(output.size() <= 1_500_000) { "处理后的图片仍然过大，请选择较小的图片" }
                    output.toByteArray()
                }
            } finally {
                bitmap.recycle()
            }
        return JSONObject()
            .put("data", "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP))
    }
}
