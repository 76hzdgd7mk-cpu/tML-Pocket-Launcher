package dev.tml.mobilelauncher.feature.mods

import java.io.ByteArrayInputStream
import java.io.DataInputStream
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.security.MessageDigest
import java.util.zip.Inflater
import java.util.zip.InflaterInputStream
import org.json.JSONArray
import org.json.JSONObject

/** Reads the public TMOD header, table and Info entry; never loads an assembly. */
data class TmodMetadata(
    val name: String,
    val version: String,
    val loaderVersion: String,
    val title: String,
    val author: String,
    val description: String,
    val dependencies: List<String>,
    val side: Int,
    val size: Long,
) {
    fun json(enabled: Boolean) =
        JSONObject()
            .put("id", name)
            .put("title", title)
            .put("version", version)
            .put("loaderVersion", loaderVersion)
            .put("author", author)
            .put("description", description)
            .put("deps", JSONArray(dependencies))
            .put("side", side)
            .put("size", size)
            .put("enabled", enabled)
}

object TmodReader {
    fun read(file: File, verifyHash: Boolean = false): TmodMetadata =
        RandomAccessFile(file, "r").use { input ->
            fun integer(): Int = Integer.reverseBytes(input.readInt())
            fun string(): String = readString { input.readUnsignedByte() }
            val magic = ByteArray(4).also(input::readFully)
            require(String(magic, Charsets.US_ASCII) == "TMOD") { "不是有效的 TMOD 模组" }
            val loader = string()
            require(
                (loader.substringBefore('.').toIntOrNull() ?: 0) >= 1 || loader.startsWith("0.11")
            ) {
                "不支持旧版 TMOD，请导入现代 tModLoader 模组"
            }
            val hash = ByteArray(20).also(input::readFully)
            input.seek(input.filePointer + 256)
            val length = integer()
            val hashStart = input.filePointer
            require(length >= 0 && input.length() - hashStart == length.toLong()) { "模组长度不匹配或已损坏" }
            val name = string()
            require(name.matches(Regex("[A-Za-z_][A-Za-z0-9_]{0,127}"))) { "无效的模组内部名称" }
            val version = string()
            val count = integer()
            require(count in 1..100_000) { "模组文件表超出限制" }
            data class Entry(
                val name: String,
                val length: Int,
                val compressed: Int,
                val offset: Long,
            )
            val entries = ArrayList<Entry>()
            var offset = 0L
            repeat(count) {
                val path = string()
                val unpacked = integer()
                val packed = integer()
                require(unpacked >= 0 && packed >= 0) { "模组文件长度无效" }
                entries.add(Entry(path, unpacked, packed, offset))
                offset += packed
                require(offset <= input.length()) { "模组文件表越界" }
            }
            val dataStart = input.filePointer
            require(dataStart + offset == input.length()) { "模组数据区不完整" }
            val info =
                entries.singleOrNull { it.name == "Info" } ?: throw IOException("缺少唯一的 Info 元数据")
            require(info.length <= 1024 * 1024 && info.compressed <= 1024 * 1024) { "模组元数据过大" }
            if (verifyHash) {
                input.seek(hashStart)
                val digest = MessageDigest.getInstance("SHA-1")
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    digest.update(buffer, 0, read)
                }
                require(MessageDigest.isEqual(hash, digest.digest())) { "模组 SHA-1 完整性校验失败" }
            }
            input.seek(dataStart + info.offset)
            val raw = ByteArray(info.compressed).also(input::readFully)
            val bytes =
                if (info.length == info.compressed) raw
                else
                    InflaterInputStream(ByteArrayInputStream(raw), Inflater(true)).use { stream ->
                        val output = java.io.ByteArrayOutputStream()
                        val buffer = ByteArray(8192)
                        while (true) {
                            val read = stream.read(buffer)
                            if (read < 0) break
                            require(output.size() + read <= info.length) { "模组 Info 解压长度不匹配" }
                            output.write(buffer, 0, read)
                        }
                        require(output.size() == info.length) { "模组 Info 解压长度不匹配" }
                        output.toByteArray()
                    }
            var title = name
            var author = ""
            var description = ""
            var side = 0
            val deps = mutableListOf<String>()
            val textTags = setOf("version", "homepage", "eacPath", "buildVersion", "modSource")
            val flags =
                setOf(
                    "noCompile",
                    "!playableOnPreview",
                    "translationMod",
                    "!hideCode",
                    "!hideResources",
                    "includeSource",
                )
            DataInputStream(ByteArrayInputStream(bytes)).use { reader ->
                fun text() = readString { reader.readUnsignedByte() }
                while (true) {
                    val tag = text()
                    if (tag.isEmpty()) break
                    when (tag) {
                        "displayName" -> title = text()
                        "author" -> author = text()
                        "description" -> description = text()
                        "side" -> side = reader.readUnsignedByte()
                        "dllReferences",
                        "modReferences",
                        "weakReferences",
                        "sortBefore",
                        "sortAfter" -> {
                            var entry = text()
                            var items = 0
                            while (entry.isNotEmpty()) {
                                require(++items <= 4096) { "模组依赖列表过长" }
                                if (tag == "modReferences") deps.add(entry)
                                entry = text()
                            }
                        }
                        in textTags -> text()
                        in flags -> Unit
                        else -> throw IOException("未知的 TMOD 元数据字段：$tag，请更新启动器")
                    }
                }
            }
            TmodMetadata(
                name,
                version,
                loader,
                title,
                author,
                description,
                deps,
                side,
                file.length(),
            )
        }

    private fun readString(byte: () -> Int): String {
        var size = 0
        var shift = 0
        while (true) {
            val next = byte()
            require(shift < 28 || next <= 7) { "TMOD 字符串长度无效" }
            size = size or ((next and 127) shl shift)
            if (next and 128 == 0) break
            shift += 7
            require(shift <= 28) { "TMOD 字符串长度无效" }
        }
        require(size in 0..262_144) { "TMOD 字符串过长" }
        return ByteArray(size) { byte().toByte() }.toString(Charsets.UTF_8)
    }
}
