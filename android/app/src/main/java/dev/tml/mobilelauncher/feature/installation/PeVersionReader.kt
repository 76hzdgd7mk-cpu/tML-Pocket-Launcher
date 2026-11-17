package dev.tml.mobilelauncher.feature.installation

import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Reads PE VERSIONINFO as bounded data. Never loads or executes the imported assembly. */
internal object PeVersionReader {
    fun productVersion(file: File): String? =
        runCatching {
                RandomAccessFile(file, "r").use { input ->
                    fun u16(): Int =
                        java.lang.Short.toUnsignedInt(
                            java.lang.Short.reverseBytes(input.readShort())
                        )
                    fun u32(): Long =
                        java.lang.Integer.toUnsignedLong(Integer.reverseBytes(input.readInt()))
                    require(input.length() >= 64 && u16() == 0x5a4d)
                    input.seek(0x3c)
                    val pe = u32()
                    require(pe in 64..input.length() - 24)
                    input.seek(pe)
                    require(u32() == 0x4550L)
                    input.skipBytes(2)
                    val count = u16()
                    input.skipBytes(12)
                    val optionalSize = u16()
                    input.skipBytes(2)
                    val optional = pe + 24
                    val magic = u16()
                    val directories =
                        when (magic) {
                            0x10b -> 96
                            0x20b -> 112
                            else -> error("Invalid PE")
                        }
                    require(optionalSize >= directories + 24 && count in 1..96)
                    input.seek(optional + directories + 16)
                    val resourceRva = u32()
                    val resourceSize = u32()
                    require(resourceRva > 0 && resourceSize in 16..8L * 1024 * 1024)
                    data class Section(val va: Long, val size: Long, val raw: Long)
                    val sections =
                        (0 until count).map {
                            input.seek(optional + optionalSize + it * 40L + 8)
                            u32() // virtual size
                            val va = u32()
                            val size = u32()
                            val raw = u32()
                            Section(va, size, raw)
                        }
                    fun offset(rva: Long, size: Long): Long {
                        val section =
                            sections.first { rva >= it.va && rva + size <= it.va + it.size }
                        val result = section.raw + rva - section.va
                        require(result >= 0 && result + size <= input.length())
                        return result
                    }
                    val data = ByteArray(resourceSize.toInt())
                    input.seek(offset(resourceRva, resourceSize))
                    input.readFully(data)
                    val buffer = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN)
                    fun word(at: Int) = buffer.getShort(at).toInt() and 0xffff
                    fun directory(at: Int): List<Pair<Int, Int>> {
                        require(at >= 0 && at + 16 <= data.size)
                        val size = word(at + 12) + word(at + 14)
                        require(size in 1..1024 && at + 16L + size * 8 <= data.size)
                        return (0 until size).map {
                            buffer.getInt(at + 16 + it * 8) to buffer.getInt(at + 20 + it * 8)
                        }
                    }
                    var entry = directory(0).first { it.first == 16 }.second
                    repeat(2) {
                        require(entry < 0)
                        entry = directory(entry and Int.MAX_VALUE).first().second
                    }
                    require(entry >= 0 && entry + 16 <= data.size)
                    val rva = Integer.toUnsignedLong(buffer.getInt(entry))
                    val size = Integer.toUnsignedLong(buffer.getInt(entry + 4))
                    require(size in 6..256L * 1024)
                    val versionData = ByteArray(size.toInt())
                    input.seek(offset(rva, size))
                    input.readFully(versionData)
                    readVersionInfo(versionData)
                }
            }
            .getOrNull()

    private fun readVersionInfo(bytes: ByteArray): String? {
        val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        fun word(at: Int) = buffer.getShort(at).toInt() and 0xffff
        fun aligned(at: Int) = (at + 3) and -4
        var result: String? = null
        var visited = 0
        fun walk(start: Int, limit: Int, depth: Int) {
            require(depth <= 5 && ++visited <= 256 && start + 6 <= limit)
            val length = word(start)
            require(length >= 6 && start + length <= limit)
            val end = start + length
            var cursor = start + 6
            val keyStart = cursor
            while (cursor + 2 <= end && word(cursor) != 0) {
                cursor += 2
                require(cursor - keyStart <= 512)
            }
            require(cursor + 2 <= end)
            val key = String(bytes, keyStart, cursor - keyStart, Charsets.UTF_16LE)
            cursor = aligned(cursor + 2)
            val valueBytes = word(start + 2) * if (word(start + 4) == 1) 2 else 1
            require(cursor + valueBytes <= end)
            if (key == "ProductVersion" && valueBytes in 2..4096) {
                result =
                    String(bytes, cursor, valueBytes, Charsets.UTF_16LE).trimEnd('\u0000').trim()
            }
            cursor = aligned(cursor + valueBytes)
            while (cursor + 6 <= end) {
                val childSize = word(cursor)
                require(childSize >= 6)
                walk(cursor, end, depth + 1)
                cursor = aligned(cursor + childSize)
            }
        }
        walk(0, bytes.size, 0)
        return result
    }
}
