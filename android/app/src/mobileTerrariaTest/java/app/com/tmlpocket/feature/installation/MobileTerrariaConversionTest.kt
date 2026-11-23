package app.com.tmlpocket.feature.installation

import android.app.Activity
import android.app.Instrumentation
import android.os.Bundle
import android.util.Log
import java.io.DataInputStream
import java.io.File
import java.io.RandomAccessFile
import java.nio.file.Files

class MobileTerrariaConversionTest : Instrumentation() {
    private var testDefaultTml = false

    override fun onCreate(arguments: Bundle) {
        super.onCreate(arguments)
        testDefaultTml = arguments.getString("defaultTml") == "true"
        start()
    }

    override fun onStart() {
        val result = Bundle()
        try {
            val targetTml = checkNotNull(MobileTerrariaPackage.targetTml(targetContext)) {
                "The launcher cannot read the Terraria PE conversion profile's target tModLoader version"
            }
            result.putString("targetTml", targetTml)
            if (testDefaultTml) {
                val root = Files.createTempDirectory(targetContext.cacheDir.toPath(), "default-tml-test-").toFile()
                try {
                    val installer = GamePackageInstaller(File(root, "files"))
                    installer.installDefaultTml(root, { false }, { _, _ -> }) { archive ->
                        targetContext.assets.open("tmodloader-default/tModLoader.zip").use { input ->
                            archive.outputStream().use { output -> input.copyTo(output) }
                        }
                    }
                    val version = installer.installedVersions().single()
                    check(version.active && version.available && version.version == "2026.09.3.1")
                    result.putString("defaultTml", version.version)
                    finish(Activity.RESULT_OK, result)
                } finally {
                    root.deleteRecursively()
                }
                return
            }
            val root = Files.createTempDirectory(targetContext.filesDir.toPath(), "conversion-test-").toFile()
            val output = File(root, "result")
            var lastStage = ""
            var lastPercent = -1
            val report = MobileTerrariaConverter.convertInstalled(targetContext, output) { stage, current, total ->
                val percent = current * 100 / total
                if (stage != lastStage || percent >= lastPercent + 10) {
                    Log.i("TerrariaConversion", "$stage $current/$total")
                    lastStage = stage
                    lastPercent = percent
                }
                true
            }
            val content = File(output, "Content")
            check(content.walkTopDown().count { it.isFile } == report.getInt("required_files"))
            val controls = File(output, MobileTerrariaPackage.CONTROL_ART_DIRECTORY)
            val spriteCount = report.getInt("control_sprites")
            check(spriteCount > 0 && controls.walkTopDown().count { it.extension == "rawimg" } == spriteCount)
            check(MobileTerrariaConverter.prepareControlArt(targetContext, output) == controls)
            result.putInt("controlSprites", spriteCount)
            result.putString("vorbisSetupIds", report.optJSONArray("vorbis_setup_ids")?.toString())
            for (name in listOf("Images", "Fonts", "Sounds")) {
                val compressed = name != "Sounds"
                File(content, name).walkTopDown().filter { it.extension == "xnb" }.forEach { xnb ->
                    DataInputStream(xnb.inputStream().buffered()).use { input ->
                        check(input.readInt() == 0x584e4277 && input.readUnsignedByte() == 5 &&
                            (input.readUnsignedByte() and 0xFE) == (if (compressed) 0x80 else 0)) {
                            "Unexpected XNB format in ${xnb.name}"
                        }
                    }
                }
            }
            checkAdpcmBank(File(content, "Wave Bank.xwb"), report.getInt("music_tracks_from_apk"))
            result.putString("output", output.absolutePath)
            result.putString("converted", report.getJSONObject("converted").toString())
            result.putInt("fallbackTextures", report.getJSONArray("fallback_textures").length())
            result.putInt("musicTracks", report.getInt("music_tracks_from_apk"))
            finish(Activity.RESULT_OK, result)
        } catch (error: Throwable) {
            Log.e("TerrariaConversion", "Conversion test failed", error)
            result.putString("stream", Log.getStackTraceString(error))
            finish(Activity.RESULT_CANCELED, result)
        }
    }

    private fun checkAdpcmBank(path: File, trackCount: Int) {
        RandomAccessFile(path, "r").use { bank ->
            fun number() = Integer.reverseBytes(bank.readInt())
            check(bank.readInt() == 0x57424e44) // WBND
            bank.seek(20)
            val entries = number()
            check(number() == trackCount * 24 && trackCount > 0)
            bank.seek(44)
            val data = number()
            check(data.toLong() + number() == bank.length())
            repeat(trackCount) { index ->
                bank.seek(entries.toLong() + 24L * index)
                val frames = number() ushr 4
                val format = number()
                val offset = number()
                val bytes = number()
                val channels = (format ushr 2) and 7
                check((format and 3) == 2 && ((format ushr 23) and 255) == 48 && channels in 1..2)
                check(bytes > 0 && bytes % (70 * channels) == 0 &&
                    frames == bytes / (70 * channels) * 128 && offset >= 0 && data.toLong() + offset + bytes <= bank.length())
            }
        }
    }
}
