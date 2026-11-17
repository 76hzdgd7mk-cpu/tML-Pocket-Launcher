package dev.tml.mobilelauncher.feature.installation

import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class PackageVersionReaderTest {
    @get:Rule val temporary = TemporaryFolder()

    @Test
    fun readsBuildVersionInsteadOfTerrariaDependencyVersion() {
        val product = "1.4.4.9+2026.09.3.1|2026.09|stable|Stable|commit|123"
        for (is64 in listOf(false, true)) {
            val file = temporary.newFile()
            file.writeBytes(pe(product, is64))
            assertEquals(product, PeVersionReader.productVersion(file))
            assertEquals("2026.09.3.1", PackageVersionReader.tml(file, "1.4.4.9"))
        }
        assertNull(PackageVersionReader.tmlVersion("1.4.4.9"))
        assertEquals(
            "2026.09.3.1",
            PackageVersionReader.installed(PackageKind.TMODLOADER, "1.4.4.9", "2026.09.3.1"),
        )
        assertEquals(
            PackageVersionReader.UNKNOWN_TML,
            PackageVersionReader.tml(temporary.newFile(), "1.4.4.9"),
        )
    }

    @Test
    fun rejectsTruncatedOrMisleadingAssemblies() {
        val file = temporary.newFile()
        val valid = pe("1.4.4.9", false)
        for (size in listOf(0, 63, 128, 511, valid.size - 1)) {
            file.writeBytes(valid.copyOf(size))
            assertNull(PeVersionReader.productVersion(file))
        }
        file.writeText("1.4.4.9+2026.09.3.1|stable")
        assertNull(PeVersionReader.productVersion(file))
        val malformed = valid.copyOf()
        ByteBuffer.wrap(malformed).order(ByteOrder.LITTLE_ENDIAN).putInt(0x200 + 20, 0x7fffffff)
        file.writeBytes(malformed)
        assertNull(PeVersionReader.productVersion(file))
    }

    @Test
    fun detectsTerrariaVersionAndDoesNotCallResourceLabelAVersion() {
        val root = temporary.newFolder()
        val assembly = File(root, "Terraria.exe").also { it.writeBytes(pe("1.4.4.9", false)) }
        assertEquals("1.4.4.9", PackageVersionReader.terraria(root, listOf(assembly)))
        assembly.delete()
        val metadata = File(root, "launcher-package.json")
        metadata.writeText("""{"format":1,"appId":105600,"version":"1.4.4.9"}""")
        assertEquals("1.4.4.9", PackageVersionReader.terraria(root, listOf(metadata)))
        metadata.writeText("""{"format":1,"appId":999,"version":"1.4.4.9"}""")
        assertEquals(
            PackageVersionReader.UNKNOWN_TERRARIA,
            PackageVersionReader.terraria(root, listOf(metadata)),
        )
        val info = File(root, "gameinfo").also { it.writeText("Terraria\n1.4.4.9\n123\nen-US") }
        assertEquals("1.4.4.9", PackageVersionReader.terraria(root, listOf(info)))
        assertEquals(
            PackageVersionReader.UNKNOWN_TERRARIA,
            PackageVersionReader.installed(
                PackageKind.TERRARIA,
                "GOG Terraria resources",
                "unknown",
            ),
        )
        assertEquals(
            "1.4.4.9",
            PackageVersionReader.installed(
                PackageKind.TERRARIA,
                "GOG Terraria resources",
                "1.4.4.9",
            ),
        )
    }

    @Test
    fun readsActualImportedAssemblyWhenAvailable() {
        val file = File("../../build/imported-tModLoader.dll")
        org.junit.Assume.assumeTrue(file.isFile)
        assertEquals("2026.09.3.1", PackageVersionReader.tml(file, "1.4.4.9"))
    }

    private fun block(
        key: String,
        value: ByteArray,
        type: Int,
        vararg children: ByteArray,
    ): ByteArray {
        val buffer = ByteBuffer.allocate(8192).order(ByteOrder.LITTLE_ENDIAN)
        buffer.position(6)
        buffer.put((key + "\u0000").toByteArray(Charsets.UTF_16LE))
        fun align() {
            while (buffer.position() % 4 != 0) buffer.put(0)
        }
        align()
        buffer.put(value)
        for (child in children) {
            align()
            buffer.put(child)
        }
        buffer.putShort(0, buffer.position().toShort())
        buffer.putShort(2, (value.size / if (type == 1) 2 else 1).toShort())
        buffer.putShort(4, type.toShort())
        return buffer.array().copyOf(buffer.position())
    }

    private fun pe(product: String, is64: Boolean): ByteArray {
        val value = block("ProductVersion", (product + "\u0000").toByteArray(Charsets.UTF_16LE), 1)
        val table = block("040904b0", byteArrayOf(), 1, value)
        val strings = block("StringFileInfo", byteArrayOf(), 1, table)
        val info = block("VS_VERSION_INFO", ByteArray(52), 0, strings)
        val size = 0x100 + info.size
        val buffer = ByteBuffer.allocate(0x200 + size).order(ByteOrder.LITTLE_ENDIAN)
        buffer.putShort(0, 0x5a4d.toShort())
        buffer.putInt(0x3c, 0x80)
        buffer.putInt(0x80, 0x4550)
        buffer.putShort(0x86, 1)
        val optionalSize = if (is64) 240 else 224
        buffer.putShort(0x94, optionalSize.toShort())
        buffer.putShort(0x98, (if (is64) 0x20b else 0x10b).toShort())
        val directory = 0x98 + (if (is64) 112 else 96) + 16
        buffer.putInt(directory, 0x1000)
        buffer.putInt(directory + 4, size)
        val section = 0x98 + optionalSize
        buffer.putInt(section + 8, size)
        buffer.putInt(section + 12, 0x1000)
        buffer.putInt(section + 16, size)
        buffer.putInt(section + 20, 0x200)
        for ((at, id, target) in
            listOf(Triple(0, 16, 0x20), Triple(0x20, 1, 0x40), Triple(0x40, 1033, 0x60))) {
            buffer.putShort(0x200 + at + 14, 1)
            buffer.putInt(0x200 + at + 16, id)
            buffer.putInt(0x200 + at + 20, target or if (target != 0x60) Int.MIN_VALUE else 0)
        }
        buffer.putInt(0x260, 0x1100)
        buffer.putInt(0x264, info.size)
        buffer.position(0x300)
        buffer.put(info)
        return buffer.array()
    }
}
