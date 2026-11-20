package app.com.tmlpocket.feature.game

/** Reads the public debuggerd tombstone wire schema without depending on hidden Android classes.
 * Schema: https://android.googlesource.com/platform/system/core/+/refs/heads/main/debuggerd/proto/tombstone.proto
 * Unknown fields are skipped, and malformed/truncated traces leave the original binary intact.
 */
internal object NativeTombstone {
    private data class Field(val number: Int, val integer: Long = 0, val bytes: ByteArray? = null) {
        fun text() = bytes?.toString(Charsets.UTF_8).orEmpty()
    }

    fun describe(data: ByteArray): String = runCatching {
        val root = fields(data)
        val tid = root.firstOrNull { it.number == 6 }?.integer ?: 0
        val signal = root.firstOrNull { it.number == 10 }?.bytes?.let(::fields).orEmpty()
        val abort = root.firstOrNull { it.number == 14 }?.text().orEmpty()
        val entry = root.filter { it.number == 16 }.firstOrNull {
            it.bytes?.let(::fields)?.firstOrNull { field -> field.number == 1 }?.integer == tid
        }?.bytes?.let(::fields)?.firstOrNull { it.number == 2 }?.bytes?.let(::fields).orEmpty()
        buildString {
            appendLine("--- Native tombstone ---")
            appendLine("线程: $tid ${entry.firstOrNull { it.number == 2 }?.text().orEmpty()}")
            appendLine("信号: ${signal.firstOrNull { it.number == 2 }?.text().orEmpty()} " +
                "${signal.firstOrNull { it.number == 4 }?.text().orEmpty()}")
            signal.firstOrNull { it.number == 9 }?.let {
                appendLine("Fault address: 0x${java.lang.Long.toHexString(it.integer)}")
            }
            if (abort.isNotBlank()) appendLine("Abort: $abort")
            root.filter { it.number == 15 }.forEach { cause ->
                cause.bytes?.let(::fields)?.firstOrNull { it.number == 1 }?.let { appendLine(it.text()) }
            }
            val frames = entry.filter { it.number == 4 }.take(128)
            frames.forEachIndexed { index, frame ->
                val info = fields(requireNotNull(frame.bytes))
                fun integer(number: Int) = info.firstOrNull { it.number == number }?.integer ?: 0
                fun text(number: Int) = info.firstOrNull { it.number == number }?.text().orEmpty()
                appendLine("#${index.toString().padStart(2, '0')} pc ${java.lang.Long.toHexString(integer(1))} " +
                    "${text(6)} (${text(4)}+${integer(5)}) BuildId: ${text(8)}")
            }
            if (frames.isEmpty()) appendLine("系统 trace 中没有可用的崩溃线程堆栈。")
        }
    }.getOrElse { "Native trace 无法解析，已保留原始文件（${it.javaClass.simpleName}）。" }

    private fun fields(data: ByteArray): List<Field> {
        var offset = 0
        fun varint(): Long {
            var value = 0L
            for (shift in 0..63 step 7) {
                require(offset < data.size) { "Truncated varint" }
                val byte = data[offset++].toInt() and 255
                if (shift == 63) require(byte <= 1) { "Varint overflow" }
                value = value or ((byte and 127).toLong() shl shift)
                if (byte and 128 == 0) return value
            }
            error("Invalid varint")
        }
        val result = ArrayList<Field>()
        while (offset < data.size) {
            require(result.size < 10000) { "Too many fields" }
            val tag = varint()
            val number = (tag ushr 3).toInt()
            require(number > 0)
            when ((tag and 7).toInt()) {
                0 -> result.add(Field(number, integer = varint()))
                1 -> { require(data.size - offset >= 8); offset += 8 }
                2 -> {
                    val length = varint()
                    require(length >= 0 && length <= data.size - offset)
                    val end = offset + length.toInt()
                    result.add(Field(number, bytes = data.copyOfRange(offset, end)))
                    offset = end
                }
                5 -> { require(data.size - offset >= 4); offset += 4 }
                else -> error("Unsupported protobuf wire type")
            }
        }
        return result
    }
}
