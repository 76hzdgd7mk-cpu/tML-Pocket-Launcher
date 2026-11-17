package dev.tml.mobilelauncher.feature.mods

import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.util.zip.Deflater
import java.util.zip.DeflaterOutputStream
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ModRepositoryTest {
    @get:Rule val temporary = TemporaryFolder()

    @Test
    fun bundledControlsPreserveOtherModsPacksAndBackUpConflictingCopies() {
        val user = temporary.newFolder("bundled-user")
        val repo = ModRepository(user)
        repo.importFile(fixture("Library"))
        repo.setEnabled(setOf("Library"), true)
        repo.savePack("mine")
        val root = File(user, "Mods")
        val previous = File(root, "MobileJoystick.tmod").apply { writeText("previous custom copy") }
        val duplicate = File(root, "touch-custom-name.tmod")
        fixture("MobileJoystick").copyTo(duplicate)
        val packageBytes = fixture("MobileJoystick").readBytes()
        val installer = BundledModInstaller(user)
        installer.install { packageBytes.inputStream() }
        assertArrayEquals(packageBytes, previous.readBytes())
        assertFalse(duplicate.exists())
        assertEquals(2, File(root, ".launcher-backup").listFiles()!!.size)
        assertTrue(
            File(root, ".launcher-backup").listFiles()!!.any {
                it.readText() == "previous custom copy"
            }
        )
        assertEquals(setOf("Library", "MobileJoystick"), enabled(repo))
        installer.install { packageBytes.inputStream() }
        assertEquals(2, File(root, ".launcher-backup").listFiles()!!.size)
        repo.setEnabled(setOf("Library", "MobileJoystick"), false)
        assertEquals(setOf("MobileJoystick"), enabled(repo))
        repo.applyPack("mine")
        assertEquals(setOf("Library", "MobileJoystick"), enabled(repo))
        assertFails { repo.delete("MobileJoystick") }
        assertFails { repo.importFile(fixture("MobileJoystick")) }
        assertTrue(
            (0 until repo.list().length())
                .map { repo.list().getJSONObject(it) }
                .single { it.getString("id") == "MobileJoystick" }
                .getBoolean("builtin")
        )
    }

    @Test
    fun invalidBundledPackageNeverReplacesWorkingControlsOrEnabledSelection() {
        val user = temporary.newFolder("invalid-bundle")
        val installer = BundledModInstaller(user)
        val bytes = fixture("MobileJoystick").readBytes()
        installer.install { bytes.inputStream() }
        val root = File(user, "Mods")
        val before = File(root, "enabled.json").readText()
        assertFails { installer.install { "corrupt package".byteInputStream() } }
        assertFails { installer.install { fixture("OtherMod").inputStream() } }
        assertArrayEquals(bytes, File(root, "MobileJoystick.tmod").readBytes())
        assertEquals(before, File(root, "enabled.json").readText())
        assertTrue(root.listFiles()!!.none { it.extension == "tmp" })
    }

    @Test
    fun readsCompressedMetadataWithoutAssembliesAndVerifiesHash() {
        val file = fixture("Demo", listOf("Library@1.0"), compressed = true)
        val meta = TmodReader.read(file, verifyHash = true)
        assertEquals("Demo", meta.name)
        assertEquals("演示模组", meta.title)
        assertEquals(listOf("Library@1.0"), meta.dependencies)
        file.appendBytes(byteArrayOf(1))
        assertFails { TmodReader.read(file, verifyHash = true) }
    }

    @Test
    fun rejectsCorruptionAndTraversalNames() {
        val file = fixture("Demo")
        val bytes = file.readBytes()
        bytes[bytes.lastIndex - 1] = (bytes[bytes.lastIndex - 1].toInt() xor 1).toByte()
        file.writeBytes(bytes)
        assertFails { TmodReader.read(file, verifyHash = true) }
        assertFails { TmodReader.read(fixture("../escape")) }
    }

    @Test
    fun enableResolvesDependenciesDisableCascadesAndPackFailureRestoresSelection() {
        val repo = ModRepository(temporary.newFolder("user"))
        repo.importFile(fixture("Library"))
        repo.importFile(fixture("Demo", listOf("Library@1.0")))
        repo.setEnabled(setOf("Demo"), true)
        assertEquals(setOf("Library", "Demo"), enabled(repo))
        repo.setEnabled(setOf("Library"), false)
        assertEquals(emptySet<String>(), enabled(repo))
        repo.setEnabled(setOf("Library"), true)
        repo.savePack("missing", listOf("Absent"))
        assertFails { repo.applyPack("missing") }
        assertEquals(setOf("Library"), enabled(repo))
        repo.savePack("good")
        repo.setEnabled(setOf("Demo"), true)
        repo.applyPack("good")
        assertEquals(setOf("Library"), enabled(repo))
        repo.validateForLaunch("v2026.10.3.0")
        assertFails { repo.validateForLaunch("2025.1.0.0") }
    }

    @Test
    fun missingDependenciesAndCyclesDoNotChangeEnabledFile() {
        val repo = ModRepository(temporary.newFolder("user"))
        repo.importFile(fixture("A", listOf("B")))
        assertFails { repo.setEnabled(setOf("A"), true) }
        assertEquals(emptySet<String>(), enabled(repo))
        repo.importFile(fixture("B", listOf("A")))
        assertFails { repo.setEnabled(setOf("A"), true) }
        assertEquals(emptySet<String>(), enabled(repo))
        assertFails { repo.delete("../outside") }
    }

    private fun enabled(repo: ModRepository): Set<String> {
        val array = repo.list()
        return (0 until array.length())
            .map { array.getJSONObject(it) }
            .filter { it.optBoolean("enabled") }
            .map { it.getString("id") }
            .toSet()
    }

    private fun fixture(
        name: String,
        deps: List<String> = emptyList(),
        compressed: Boolean = false,
    ): File {
        val info =
            ByteArrayOutputStream()
                .apply {
                    string("displayName")
                    string("演示模组")
                    string("author")
                    string("test")
                    string("modReferences")
                    deps.forEach { string(it) }
                    string("")
                    string("")
                }
                .toByteArray()
        val packed =
            if (compressed)
                ByteArrayOutputStream()
                    .also { output ->
                        DeflaterOutputStream(output, Deflater(9, true)).use { it.write(info) }
                    }
                    .toByteArray()
            else info
        val payload =
            ByteArrayOutputStream()
                .apply {
                    string(name)
                    string("1.0")
                    integer(1)
                    string("Info")
                    integer(info.size)
                    integer(packed.size)
                    write(packed)
                }
                .toByteArray()
        val file = temporary.newFile()
        file.writeBytes(
            ByteArrayOutputStream()
                .apply {
                    write("TMOD".toByteArray())
                    string("2026.10.1.0")
                    write(MessageDigest.getInstance("SHA-1").digest(payload))
                    write(ByteArray(256))
                    integer(payload.size)
                    write(payload)
                }
                .toByteArray()
        )
        return file
    }

    private fun ByteArrayOutputStream.string(text: String) {
        val bytes = text.toByteArray(Charsets.UTF_8)
        var size = bytes.size
        while (size >= 128) {
            write((size and 127) or 128)
            size = size ushr 7
        }
        write(size)
        write(bytes)
    }

    private fun ByteArrayOutputStream.integer(value: Int) {
        write(ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(value).array())
    }

    private fun assertFails(action: () -> Unit) {
        try {
            action()
            fail("Expected rejection")
        } catch (failure: Exception) {
            assertFalse(failure is AssertionError)
        }
    }
}
