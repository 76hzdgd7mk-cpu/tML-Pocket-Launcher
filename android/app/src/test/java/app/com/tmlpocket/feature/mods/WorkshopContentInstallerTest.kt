package app.com.tmlpocket.feature.mods

import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class WorkshopContentInstallerTest {
    @get:Rule val temporary = TemporaryFolder()

    @Test
    fun installsWorldAndWorkshopMetadataIntoWorldDirectory() {
        val userData = temporary.newFolder("world-user")
        val archive = archive(
            "workshop.json" to "{\"ContentType\":\"World\",\"SteamEntryId\":\"123\"}".toByteArray(),
            "world.wld" to byteArrayOf(1, 2, 3),
            "world.twld" to byteArrayOf(4, 5),
        )

        WorkshopContentInstaller(userData, ModRepository(userData)).install(105600, "123", "My World", archive)

        val worlds = File(userData, "Worlds")
        assertTrue(File(worlds, "My World [123].wld").isFile)
        assertTrue(File(worlds, "My World [123].twld").isFile)
    }

    @Test
    fun installsResourcePackDirectoryAndMetadata() {
        val userData = temporary.newFolder("pack-user")
        val archive = archive(
            "workshop.json" to "{\"ContentType\":\"ResourcePack\"}".toByteArray(),
            "pack.json" to "{\"name\":\"Test Pack\"}".toByteArray(),
            "Content/Images/Item_1.png" to byteArrayOf(8, 9),
        )

        WorkshopContentInstaller(userData, ModRepository(userData)).install(105600, "456", "Texture Pack", archive)

        val pack = File(userData, "ResourcePacks/Texture Pack [456]")
        assertTrue(File(pack, "pack.json").isFile)
        assertTrue(File(pack, "workshop.json").isFile)
        assertTrue(File(pack, "Content/Images/Item_1.png").isFile)
    }

    @Test
    fun rejectsArchiveTraversalWithoutWritingOutsideStaging() {
        val userData = temporary.newFolder("unsafe-user")
        val archive = archive(
            "workshop.json" to "{\"ContentType\":\"ResourcePack\"}".toByteArray(),
            "pack.json" to "{\"name\":\"Unsafe\"}".toByteArray(),
            "../escaped.txt" to byteArrayOf(1),
        )

        assertFails { WorkshopContentInstaller(userData, ModRepository(userData)).install(105600, "789", "Unsafe", archive) }
        assertFalse(File(userData.parentFile, "escaped.txt").exists())
        assertFalse(File(userData, "ResourcePacks/Unsafe [789]").exists())
    }

    private fun archive(vararg files: Pair<String, ByteArray>): File {
        val file = temporary.newFile("payload.zip")
        ZipOutputStream(file.outputStream()).use { zip ->
            files.forEach { (name, bytes) ->
                zip.putNextEntry(ZipEntry(name))
                zip.write(bytes)
                zip.closeEntry()
            }
        }
        return file
    }

    private fun assertFails(action: () -> Unit) {
        try {
            action()
            throw AssertionError("Expected an exception")
        } catch (_: IllegalArgumentException) {
        } catch (_: java.io.IOException) {
        }
    }
}
