package app.com.tmlpocket.feature.mods

import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.util.zip.Deflater
import java.util.zip.DeflaterOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import app.com.tmlpocket.feature.launcher.ui.SteamWorkshopPreview

class ModRepositoryTest {
    @get:Rule val temporary = TemporaryFolder()

    @Test
    fun legacyTouchMigrationBacksUpOldModAndPreservesOtherSelectionsAndPacks() {
        val user = temporary.newFolder("bundled-user")
        val repo = ModRepository(user)
        repo.importFile(fixture("Library"))
        repo.setEnabled(setOf("Library"), true)
        val root = File(user, "Mods")
        File(root, "enabled.json").writeText("""["Library","MobileJoystick"]""")
        repo.savePack("mine")
        val previous = File(root, "MobileJoystick.tmod").apply { writeText("previous custom copy") }
        val duplicate = File(root, "touch-custom-name.tmod")
        fixture("MobileJoystick").copyTo(duplicate)
        val legacyConfig = File(user, "ModConfigs/MobileJoystick_MobileJoystickConfig.json").apply {
            parentFile!!.mkdirs()
            writeText("""{"Opacity":0.5}""")
        }
        LegacyTouchMod.migrate(user)
        assertFalse(previous.exists())
        assertFalse(duplicate.exists())
        assertEquals(2, File(root, ".launcher-backup").listFiles()!!.size)
        assertTrue(
            File(root, ".launcher-backup").listFiles()!!.any {
                it.readText() == "previous custom copy"
            }
        )
        assertEquals(setOf("Library"), enabled(repo))
        LegacyTouchMod.migrate(user)
        assertEquals(2, File(root, ".launcher-backup").listFiles()!!.size)
        repo.setEnabled(setOf("Library"), false)
        assertEquals(emptySet<String>(), enabled(repo))
        repo.applyPack("mine")
        assertEquals(setOf("Library"), enabled(repo))
        assertFails { repo.importFile(fixture("MobileJoystick")) }
        assertEquals(1, repo.list().length())
        assertEquals("""{"Opacity":0.5}""", legacyConfig.readText())
    }

    @Test
    fun touchSettingsReadLegacyJsonAndMergeSeparateEditors() {
        val user = temporary.newFolder("touch-settings")
        val legacy = File(user, "ModConfigs/MobileJoystick_MobileJoystickConfig.json")
        legacy.parentFile!!.mkdirs()
        legacy.writeText("""{"Opacity":0.5,"AimDistance":500}""")
        val settings = app.com.tmlpocket.feature.launcher.MobileControlsSettings(user)
        assertEquals(0.5, settings.read().getDouble("Opacity"), 0.001)
        settings.save(org.json.JSONObject("""{"category":"controls","settings":{"Opacity":0.6}}"""))
        settings.save(org.json.JSONObject("""{"category":"interface","settings":{"UIFontScale":1.2}}"""))
        assertEquals(0.6, settings.read().getDouble("Opacity"), 0.001)
        assertEquals(1.2, settings.read().getDouble("UIFontScale"), 0.001)
        assertEquals(500, settings.read().getInt("AimDistance"))
        assertFails { settings.save(org.json.JSONObject("""{"category":"interface","settings":{"Opacity":1}}""")) }
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
    fun extractsWorkshopIconBeforeFallbackIcons() {
        val png = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
        val gif = "GIF89a".toByteArray()
        val file = fixture(
            "IconMod",
            icons = listOf("icon.png" to png, "icon_workshop.gif" to gif),
        )

        val icon = TmodReader.readIcon(file)

        assertTrue(icon!!.startsWith("data:image/gif;base64,"))
        assertTrue(icon.endsWith(java.util.Base64.getEncoder().encodeToString(gif)))
    }

    @Test
    fun installsCompatibleModFromWorkshopBundleWithMultipleBuilds() {
        val userData = temporary.newFolder("workshop-mod")
        val repo = ModRepository(userData)
        val archive = temporary.newFile("workshop.zip")
        ZipOutputStream(archive.outputStream()).use { output ->
            for (loaderVersion in listOf("2026.10.1.0", "2026.11.1.0")) {
                output.putNextEntry(ZipEntry("$loaderVersion/VersionedMod.tmod"))
                fixture("VersionedMod", loaderVersion = loaderVersion).inputStream().use { it.copyTo(output) }
                output.closeEntry()
            }
        }

        val installedId = WorkshopContentInstaller(userData, repo)
            .install(1281930, "123", "Test Mod", archive, "v2026.10.3.0")

        assertEquals("VersionedMod", installedId)
        assertEquals("2026.10.1.0", repo.list().getJSONObject(0).getString("loaderVersion"))
    }

    @Test
    fun workshopPreviewAllowlistRejectsUntrustedAndDowngradeUrls() {
        assertTrue(SteamWorkshopPreview.isAllowed("https://steamuserimages-a.akamaihd.net/ugc/123/preview.png"))
        assertTrue(SteamWorkshopPreview.isAllowed("https://images.steamusercontent.com/ugc/123/preview.webp"))
        assertFalse(SteamWorkshopPreview.isAllowed("http://steamuserimages-a.akamaihd.net/ugc/123/preview.png"))
        assertFalse(SteamWorkshopPreview.isAllowed("https://evil.example/preview.png"))
        assertFalse(SteamWorkshopPreview.isAllowed("https://steamuserimages-a.akamaihd.net.evil.example/preview.png"))
        assertFalse(SteamWorkshopPreview.isAllowed("https://user@steamuserimages-a.akamaihd.net/preview.png"))
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

    @Test
    fun reportsMissingOutdatedDisabledAndOptionalDependencies() {
        val repo = ModRepository(temporary.newFolder("dependencies"))
        repo.importFile(fixture("Library"))
        repo.importFile(fixture("Core"))
        repo.importFile(fixture("Upgrade"))
        repo.importFile(
            fixture(
                "Demo",
                listOf("Library@1.0", "Missing", "Upgrade@2.0", "Core"),
                weakDeps = listOf("Optional"),
            )
        )
        repo.setEnabled(setOf("Core"), true)
        val entries = repo.list()
        val dependencies = (0 until entries.length())
            .map(entries::getJSONObject)
            .single { it.getString("id") == "Demo" }
            .getJSONArray("dependencies")
        val byName = (0 until dependencies.length()).map(dependencies::getJSONObject)
            .associateBy { it.getString("name") }

        assertEquals("disabled", byName.getValue("Library").getString("status"))
        assertEquals("missing", byName.getValue("Missing").getString("status"))
        assertEquals("outdated", byName.getValue("Upgrade").getString("status"))
        assertEquals("2.0", byName.getValue("Upgrade").getString("requiredVersion"))
        assertEquals("1.0", byName.getValue("Upgrade").getString("installedVersion"))
        assertEquals("enabled", byName.getValue("Core").getString("status"))
        assertTrue(byName.getValue("Optional").getBoolean("optional"))
        assertFalse(byName.getValue("Missing").getBoolean("optional"))
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
        icons: List<Pair<String, ByteArray>> = emptyList(),
        loaderVersion: String = "2026.10.1.0",
        weakDeps: List<String> = emptyList(),
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
                    if (weakDeps.isNotEmpty()) {
                        string("weakReferences")
                        weakDeps.forEach { string(it) }
                        string("")
                    }
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
                    integer(1 + icons.size)
                    string("Info")
                    integer(info.size)
                    integer(packed.size)
                    icons.forEach { (entry, bytes) ->
                        string(entry)
                        integer(bytes.size)
                        integer(bytes.size)
                    }
                    write(packed)
                    icons.forEach { (_, bytes) -> write(bytes) }
                }
                .toByteArray()
        val file = temporary.newFile()
        file.writeBytes(
            ByteArrayOutputStream()
                .apply {
                    write("TMOD".toByteArray())
                    string(loaderVersion)
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
