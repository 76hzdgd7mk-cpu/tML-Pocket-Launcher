package app.com.tmlpocket.feature.installation

import java.io.File
import java.nio.file.Files
import java.util.concurrent.CancellationException
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import org.apache.commons.compress.archivers.zip.ZipArchiveEntry
import org.apache.commons.compress.archivers.zip.ZipArchiveOutputStream
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeNoException
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class GamePackageInstallerTest {
    @get:Rule val temporary = TemporaryFolder()
    private val filesDir by lazy { temporary.newFolder("files") }
    private val installer by lazy { GamePackageInstaller(filesDir) }

    @Test
    fun oldVersionLabelsAreCorrectedWithoutReimporting() {
        installer.importPackage(
            PackageKind.TERRARIA,
            zip(
                terraria() +
                    ("launcher-package.json" to
                        """{"format":1,"appId":105600,"version":"1.4.4.9"}""")
            ),
            source = TerrariaSource.GOG,
        )
        installer.importPackage(PackageKind.TMODLOADER, zip(tml()))
        val file = File(filesDir, "installed-packages.json")
        val state = JSONObject(file.readText())
        state.getJSONObject("TMODLOADER").put("version", "1.4.4.9")
        state.getJSONObject("TERRARIA").put("version", "GOG Terraria resources")
        file.writeText(state.toString())
        val reopened = GamePackageInstaller(filesDir)
        assertEquals("2026.9.1", reopened.packageStatus(PackageKind.TMODLOADER))
        assertEquals("1.4.4.9", reopened.packageStatus(PackageKind.TERRARIA))
        assertEquals(TerrariaSource.GOG, reopened.terrariaSource())
    }

    @Test
    fun sourceSurvivesReopenAndFailedReplacement() {
        installer.importPackage(PackageKind.TERRARIA, zip(terraria()), source = TerrariaSource.GOG)
        installer.importPackage(PackageKind.TMODLOADER, zip(tml()))
        assertEquals(
            TerrariaSource.GOG,
            GamePackageInstaller(filesDir).installation()!!.terrariaSource,
        )
        expectFailure { installer.importPackage(PackageKind.TERRARIA, zip(mapOf("bad" to "bad"))) }
        assertEquals(TerrariaSource.GOG, installer.terrariaSource())
        installer.importPackage(PackageKind.TERRARIA, zip(terraria()))
        assertEquals(TerrariaSource.STEAM, installer.terrariaSource())
    }

    @Test
    fun legacyAndUnknownSourcesRequireSteamVerification() {
        installBoth()
        val file = File(filesDir, "installed-packages.json")
        val state = JSONObject(file.readText())
        state.getJSONObject("TERRARIA").remove("source")
        file.writeText(state.toString())
        assertEquals(TerrariaSource.STEAM, installer.installation()!!.terrariaSource)
        state.getJSONObject("TERRARIA").put("source", "offline")
        file.writeText(state.toString())
        assertEquals(TerrariaSource.STEAM, installer.terrariaSource())
    }

    @Test
    fun nestedPackagesRemainSeparateAndSurviveReopening() {
        installer.importPackage(PackageKind.TERRARIA, zip(terraria("Terraria/")))
        assertNotNull(installer.packageStatus(PackageKind.TERRARIA))
        assertNull(installer.packageStatus(PackageKind.TMODLOADER))
        assertNull(installer.installation())
        installer.importPackage(PackageKind.TMODLOADER, zip(tml("release/")), "v2026.10")

        val installed = GamePackageInstaller(filesDir).installation()!!
        assertEquals(File(filesDir, "games/tmodloader/release"), installed.tmlRoot)
        assertEquals(File(filesDir, "games/terraria/Terraria"), installed.terrariaRoot)
        assertEquals(File(filesDir, "games/terraria/Terraria/Content"), installed.contentRoot)
        assertEquals("v2026.10", installed.version)
        assertTrue(File(installed.tmlRoot, "Content/ModLoader.xnb").isFile)
        assertFalse(File(installed.contentRoot, "ModLoader.xnb").exists())
    }

    @Test
    fun resourcesOnlyZipIsSupported() {
        installer.importPackage(
            PackageKind.TERRARIA,
            zip(mapOf("Images/Tiles_0.xnb" to "resource")),
        )
        installer.importPackage(PackageKind.TMODLOADER, zip(tml()))
        val installed = installer.installation()!!
        assertEquals(File(filesDir, "games/terraria"), installed.contentRoot)
        assertEquals("2026.9.1", installed.version)
    }

    @Test
    fun fnaCanLiveInVersionedLibrariesDirectory() {
        val entries = tml().toMutableMap()
        entries.remove("FNA.dll")
        entries["Libraries/FNA/1.0.0/FNA.dll"] = "managed-fna"
        // Official tML releases retain flat reference asset names in deps.json.
        entries["tModLoader.deps.json"] = deps()
        installer.importPackage(PackageKind.TMODLOADER, zip(entries))
        assertEquals("2026.9.1", installer.packageStatus(PackageKind.TMODLOADER))
    }

    @Test
    fun projectAndReferenceFnaEntriesCanShareOneRelocatedAssembly() {
        val entries = tml().toMutableMap()
        entries.remove("FNA.dll")
        entries["Libraries/FNA/1.0.0/FNA.dll"] = "managed-fna"
        entries["tModLoader.deps.json"] =
            deps()
                .replace(
                    "\"FNA/1.0.0\":{\"runtime\":{\"FNA.dll\":{}}}",
                    "\"FNA/1.0.0\":{\"runtime\":{\"FNA.dll\":{}}},\"FNA.Reference/23.10.0.0\":{\"runtime\":{\"FNA.dll\":{}}}",
                )
        installer.importPackage(PackageKind.TMODLOADER, zip(entries))
        assertNotNull(installer.packageStatus(PackageKind.TMODLOADER))
    }

    @Test
    fun fnaCanResolveThroughNugetLibraryPath() {
        val entries = tml().toMutableMap()
        entries.remove("FNA.dll")
        entries["Libraries/fna/1.0.0/lib/net8.0/FNA.dll"] = "managed-fna"
        entries["tModLoader.deps.json"] = deps("lib/net8.0/FNA.dll", "fna/1.0.0")
        installer.importPackage(PackageKind.TMODLOADER, zip(entries))
        assertNotNull(installer.packageStatus(PackageKind.TMODLOADER))
    }

    @Test
    fun invalidReplacementPreservesOldPackageMetadataAndSaves() {
        installBoth()
        val state = File(filesDir, "installed-packages.json").readText()
        val save =
            File(filesDir, "userdata/Players/Hero.plr").also {
                requireNotNull(it.parentFile).mkdirs()
                it.writeText("save-data")
            }
        val incomplete = tml().toMutableMap().apply { remove("FNA.dll") }
        expectFailure { installer.importPackage(PackageKind.TMODLOADER, zip(incomplete), "broken") }
        assertEquals("old", installer.packageStatus(PackageKind.TMODLOADER))
        assertEquals(state, File(filesDir, "installed-packages.json").readText())
        assertEquals(
            "assembly",
            File(installer.installation()!!.tmlRoot, "tModLoader.dll").readText(),
        )
        assertEquals("save-data", save.readText())
        assertNoStagingDirectories()
    }

    @Test
    fun cancellationAfterOldPackageMovesRollsBack() {
        assertCancellationRollsBack(cancelAtCommitCheck = 2)
    }

    @Test
    fun cancellationAfterNewPackageMovesRollsBack() {
        assertCancellationRollsBack(cancelAtCommitCheck = 3)
    }

    @Test
    fun cancellationDuringExtractionLeavesNoInstallation() {
        var stop = false
        try {
            installer.importPackage(
                PackageKind.TERRARIA,
                zip(terraria()),
                cancelled = { stop },
                progress = { _, percent -> if (percent > 0) stop = true },
            )
            throw AssertionError("Expected cancellation")
        } catch (_: CancellationException) {
            assertNull(installer.packageStatus(PackageKind.TERRARIA))
            assertFalse(File(filesDir, "installed-packages.json").exists())
            assertNoStagingDirectories()
        }
    }

    @Test
    fun metadataWriteFailureRollsBackPackageDirectory() {
        installBoth()
        val state = File(filesDir, "installed-packages.json")
        val originalState = state.readText()
        val replacement = tml().toMutableMap().apply { put("tModLoader.dll", "replacement") }
        expectFailure {
            installer.importPackage(
                PackageKind.TMODLOADER,
                zip(replacement),
                "new",
                progress = { _, percent ->
                    if (percent == 95) {
                        // Simulate an I/O failure at the metadata destination after validation.
                        assertTrue(state.delete())
                        assertTrue(state.mkdir())
                        File(state, "blocked").writeText("cannot replace nonempty directory")
                    }
                },
            )
        }
        assertEquals("assembly", File(filesDir, "games/tmodloader/tModLoader.dll").readText())
        assertTrue(state.deleteRecursively())
        state.writeText(originalState)
        assertEquals("old", installer.installation()!!.version)
        assertNoStagingDirectories()
    }

    @Test
    fun unsafePathsCannotEscapeStaging() {
        val unsafe =
            listOf(
                "../escaped.xnb",
                "/escaped.xnb",
                "C:/escaped.xnb",
                "a\\..\\escaped.xnb",
                "a/../escaped.xnb",
                "a//bad",
                "a/./bad",
                "NUL.txt",
                "trailing./bad",
            )
        for (path in unsafe) {
            expectFailure {
                installer.importPackage(
                    PackageKind.TERRARIA,
                    zip(mapOf(path to "bad") + terraria()),
                )
            }
            assertFalse(File(filesDir, "games/terraria").exists())
            assertNoStagingDirectories()
        }
        assertFalse(File(filesDir, "games/escaped.xnb").exists())
    }

    @Test
    fun caseCollisionsIncludingImplicitParentsAreRejected() {
        for (extra in
            listOf("content/other.xnb", "Content/images/other.xnb", "Content/Images/tiles_0.xnb")) {
            expectFailure {
                installer.importPackage(
                    PackageKind.TERRARIA,
                    zip(terraria() + (extra to "collision")),
                )
            }
        }
        assertNull(installer.packageStatus(PackageKind.TERRARIA))
        assertNoStagingDirectories()
    }

    @Test
    fun zipSymlinksAreRejected() {
        val archive = temporary.newFile("symlink.zip")
        ZipArchiveOutputStream(archive).use { stream ->
            val entry = ZipArchiveEntry("Content/Images/Tiles_0.xnb")
            entry.unixMode = 0xA1FF
            stream.putArchiveEntry(entry)
            stream.write("../../outside".toByteArray())
            stream.closeArchiveEntry()
        }
        expectFailure { installer.importPackage(PackageKind.TERRARIA, archive) }
        assertNull(installer.packageStatus(PackageKind.TERRARIA))
        assertNoStagingDirectories()
    }

    @Test
    fun invalidZipAndLegacyRuntimeAreRejected() {
        val invalid = temporary.newFile().also { it.writeText("not a zip") }
        expectFailure { installer.importPackage(PackageKind.TERRARIA, invalid) }
        val legacy =
            tml().toMutableMap().apply {
                put(
                    "tModLoader.runtimeconfig.json",
                    """{"runtimeOptions":{"framework":{"name":"Microsoft.NETCore.App","version":"3.1.0"}}}""",
                )
            }
        expectFailure { installer.importPackage(PackageKind.TMODLOADER, zip(legacy)) }
        assertNull(installer.installation())
    }

    @Test
    fun missingManagedDependenciesAndEmptyResourcesAreRejected() {
        val missing =
            tml().toMutableMap().apply { put("tModLoader.deps.json", deps("missing/FNA.dll")) }
        expectFailure { installer.importPackage(PackageKind.TMODLOADER, zip(missing)) }
        expectFailure {
            installer.importPackage(
                PackageKind.TERRARIA,
                zip(mapOf("Content/Images/readme.txt" to "not resources")),
            )
        }
        assertNull(installer.packageStatus(PackageKind.TMODLOADER))
    }

    @Test
    fun removedInstalledResourceDisablesLaunch() {
        installBoth()
        assertTrue(File(filesDir, "games/terraria/Content/Images/Tiles_0.xnb").delete())
        assertNull(installer.packageStatus(PackageKind.TERRARIA))
        assertNull(installer.installation())
        assertEquals("old", installer.packageStatus(PackageKind.TMODLOADER))
    }

    @Test
    fun cleanupOfExternallyModifiedOldPackageDoesNotFollowLinksIntoSaves() {
        installBoth()
        val saves = File(filesDir, "userdata").also { it.mkdirs() }
        val save = File(saves, "Hero.plr").also { it.writeText("save-data") }
        try {
            Files.createSymbolicLink(
                File(filesDir, "games/tmodloader/external-link").toPath(),
                saves.toPath(),
            )
        } catch (unavailable: Exception) {
            assumeNoException("Host does not allow creating symbolic links", unavailable)
        }
        installer.importPackage(PackageKind.TMODLOADER, zip(tml()), "new")
        assertEquals("save-data", save.readText())
        assertEquals("new", installer.installation()!!.version)
        assertNoStagingDirectories()
    }

    @Test
    fun restartBeforeBackupRenamePreservesPreviousInstallation() {
        assertCrashRollsBack(commitCheck = 1)
    }

    @Test
    fun restartAfterBackupRenameRestoresPreviousInstallation() {
        assertCrashRollsBack(commitCheck = 2)
    }

    @Test
    fun restartAfterNewDirectoryRenameRestoresPreviousInstallation() {
        assertCrashRollsBack(commitCheck = 3)
    }

    @Test
    fun restartDuringFirstInstallationRemovesUncommittedDirectory() {
        crashDuringCommit(commitCheck = 3)
        assertTrue(File(filesDir, "games/tmodloader/tModLoader.dll").isFile)
        assertNull(GamePackageInstaller(filesDir).packageStatus(PackageKind.TMODLOADER))
        assertFalse(File(filesDir, "games/tmodloader").exists())
        assertFalse(File(filesDir, "installed-packages.json").exists())
        assertNoPendingTransaction()
    }

    @Test
    fun restartAfterManifestCommitKeepsNewPackageAndFinishesCleanup() {
        installBoth()
        crashDuringCommit(commitCheck = 3)
        val journal = readJournal()
        // Model the final atomic manifest rename, then immediate process death.
        File(filesDir, "installed-packages.json")
            .writeText(journal.getJSONObject("newState").toString())
        val reopened = GamePackageInstaller(filesDir)
        assertEquals("new", reopened.installation()!!.version)
        assertEquals(
            "replacement",
            File(reopened.installation()!!.tmlRoot, "tModLoader.dll").readText(),
        )
        assertNoPendingTransaction()
    }

    @Test
    fun restartAfterCommittedBackupWasAlreadyDeletedIsIdempotent() {
        installBoth()
        crashDuringCommit(commitCheck = 3)
        val journal = readJournal()
        File(filesDir, "installed-packages.json")
            .writeText(journal.getJSONObject("newState").toString())
        assertTrue(File(filesDir, "games/.backup-${journal.getString("id")}").deleteRecursively())
        assertEquals("new", GamePackageInstaller(filesDir).installation()!!.version)
        assertEquals("new", GamePackageInstaller(filesDir).installation()!!.version)
        assertNoPendingTransaction()
    }

    @Test
    fun restartDuringRollbackAfterBackupRestorationCompletesRollback() {
        installBoth()
        val previousMetadata = File(filesDir, "installed-packages.json").readText()
        crashDuringCommit(commitCheck = 3)
        val journal = readJournal().put("phase", "rolling-back")
        journalFile().writeText(journal.toString())
        val destination = File(filesDir, "games/tmodloader")
        assertTrue(destination.deleteRecursively())
        Files.move(
            File(filesDir, "games/.backup-${journal.getString("id")}").toPath(),
            destination.toPath(),
        )
        assertEquals("old", GamePackageInstaller(filesDir).installation()!!.version)
        assertEquals(previousMetadata, File(filesDir, "installed-packages.json").readText())
        assertNoPendingTransaction()
    }

    @Test
    fun invalidJournalCannotNominatePathsOrChangeInstalledFiles() {
        installBoth()
        crashDuringCommit(commitCheck = 2)
        val originalJournal = readJournal()
        val backup = File(filesDir, "games/.backup-${originalJournal.getString("id")}")
        val previousMetadata = File(filesDir, "installed-packages.json").readText()
        val unsafeChanges: List<(JSONObject) -> Unit> =
            listOf(
                { it.put("id", "../../userdata") },
                { it.put("kind", "../userdata") },
                { it.put("phase", "unknown") },
                {
                    it.getJSONObject("newState")
                        .put("TERRARIA", JSONObject().put("version", "changed"))
                },
            )
        for (change in unsafeChanges) {
            val altered = JSONObject(originalJournal.toString()).also(change)
            journalFile().writeText(altered.toString())
            val reopened = GamePackageInstaller(filesDir)
            assertNull(reopened.installation())
            expectFailure { reopened.importPackage(PackageKind.TERRARIA, zip(terraria())) }
            assertTrue(backup.isDirectory)
            assertFalse(File(filesDir, "games/tmodloader").exists())
            assertEquals(previousMetadata, File(filesDir, "installed-packages.json").readText())
            assertEquals(altered.toString(), journalFile().readText())
        }
        journalFile().writeText(originalJournal.toString())
        assertEquals("old", GamePackageInstaller(filesDir).installation()!!.version)
        assertNoPendingTransaction()
    }

    @Test
    fun changedManifestLeavesBackupAndJournalUntouchedForManualRecovery() {
        installBoth()
        crashDuringCommit(commitCheck = 2)
        val journal = readJournal()
        val originalJournal = journalFile().readText()
        val stateFile = File(filesDir, "installed-packages.json")
        val changed =
            JSONObject(stateFile.readText()).put("unexpected", "external-change").toString()
        stateFile.writeText(changed)
        assertNull(GamePackageInstaller(filesDir).installation())
        assertEquals(changed, stateFile.readText())
        assertTrue(File(filesDir, "games/.backup-${journal.getString("id")}").isDirectory)
        assertEquals(originalJournal, journalFile().readText())
        stateFile.writeText(journal.getJSONObject("oldState").toString())
        assertEquals("old", GamePackageInstaller(filesDir).installation()!!.version)
        assertNoPendingTransaction()
    }

    @Test
    fun missingBackupLeavesUncommittedNewPackageUntouched() {
        installBoth()
        crashDuringCommit(commitCheck = 3)
        val journal = readJournal()
        val originalJournal = journalFile().readText()
        val backup = File(filesDir, "games/.backup-${journal.getString("id")}")
        val savedBackup = File(filesDir, "saved-backup")
        Files.move(backup.toPath(), savedBackup.toPath())
        assertNull(GamePackageInstaller(filesDir).installation())
        assertEquals("replacement", File(filesDir, "games/tmodloader/tModLoader.dll").readText())
        assertEquals(originalJournal, journalFile().readText())
        Files.move(savedBackup.toPath(), backup.toPath())
        assertEquals("old", GamePackageInstaller(filesDir).installation()!!.version)
        assertNoPendingTransaction()
    }

    private fun assertCrashRollsBack(commitCheck: Int) {
        installBoth()
        val previousMetadata = File(filesDir, "installed-packages.json").readText()
        crashDuringCommit(commitCheck)
        val reopened = GamePackageInstaller(filesDir)
        assertEquals("old", reopened.installation()!!.version)
        assertEquals(
            "assembly",
            File(reopened.installation()!!.tmlRoot, "tModLoader.dll").readText(),
        )
        assertEquals(previousMetadata, File(filesDir, "installed-packages.json").readText())
        assertNoPendingTransaction()
        assertEquals("old", GamePackageInstaller(filesDir).installation()!!.version)
    }

    private class SimulatedProcessDeath : Error()

    private fun crashDuringCommit(commitCheck: Int) {
        var committing = false
        var checks = 0
        val replacement = tml().toMutableMap().apply { put("tModLoader.dll", "replacement") }
        try {
            installer.importPackage(
                PackageKind.TMODLOADER,
                zip(replacement),
                "new",
                cancelled = {
                    if (committing && ++checks == commitCheck) throw SimulatedProcessDeath()
                    false
                },
                progress = { _, percent -> if (percent == 95) committing = true },
            )
            throw AssertionError("Expected simulated process death")
        } catch (_: SimulatedProcessDeath) {
            // Error intentionally bypasses ordinary exception rollback to model abrupt exit.
            assertTrue(journalFile().isFile)
        }
    }

    private fun journalFile() = File(filesDir, ".package-install-transaction.json")

    private fun readJournal() = JSONObject(journalFile().readText())

    private fun assertNoPendingTransaction() {
        assertFalse(journalFile().exists())
        assertNoStagingDirectories()
    }

    private fun assertCancellationRollsBack(cancelAtCommitCheck: Int) {
        installBoth()
        val state = File(filesDir, "installed-packages.json").readText()
        var committing = false
        var checks = 0
        try {
            installer.importPackage(
                PackageKind.TMODLOADER,
                zip(tml()),
                "new",
                cancelled = { committing && ++checks >= cancelAtCommitCheck },
                progress = { _, percent -> if (percent == 95) committing = true },
            )
            throw AssertionError("Expected cancellation")
        } catch (_: CancellationException) {
            assertEquals("old", installer.installation()!!.version)
            assertEquals(state, File(filesDir, "installed-packages.json").readText())
            assertNoStagingDirectories()
        }
    }

    private fun installBoth() {
        installer.importPackage(PackageKind.TERRARIA, zip(terraria()))
        installer.importPackage(PackageKind.TMODLOADER, zip(tml()), "old")
    }

    private fun assertNoStagingDirectories() {
        assertTrue(File(filesDir, "games").listFiles().orEmpty().none { it.name.startsWith('.') })
    }

    private fun expectFailure(action: () -> Unit) {
        try {
            action()
        } catch (_: Exception) {
            return
        }
        throw AssertionError("Expected package import failure")
    }

    private fun zip(entries: Map<String, String>): File =
        temporary.newFile().also { archive ->
            ZipOutputStream(archive.outputStream()).use { stream ->
                for ((path, content) in entries) {
                    stream.putNextEntry(ZipEntry(path))
                    stream.write(content.toByteArray())
                    stream.closeEntry()
                }
            }
        }

    private fun terraria(prefix: String = "") =
        mapOf("${prefix}Content/Images/Tiles_0.xnb" to "resource")

    private fun tml(prefix: String = ""): Map<String, String> =
        mapOf(
                "tModLoader.dll" to "assembly",
                "tModLoader.deps.json" to deps(),
                "tModLoader.runtimeconfig.json" to
                    """{"runtimeOptions":{"tfm":"net8.0","framework":{"name":"Microsoft.NETCore.App","version":"8.0.0"}}}""",
                "FNA.dll" to "managed-fna",
                "Content/ModLoader.xnb" to "modloader-resource",
            )
            .mapKeys { (path, _) -> prefix + path }

    private fun deps(fnaPath: String = "FNA.dll", libraryPath: String = "") =
        """
        {"runtimeTarget":{"name":".NETCoreApp,Version=v8.0"},
         "targets":{".NETCoreApp,Version=v8.0":{
           "tModLoader/2026.9.1":{"runtime":{"tModLoader.dll":{}}},
           "FNA/1.0.0":{"runtime":{"$fnaPath":{}}}}},
         "libraries":{"tModLoader/2026.9.1":{"type":"project"},"FNA/1.0.0":{"type":"package","path":"$libraryPath"}}}
    """
            .trimIndent()
}
