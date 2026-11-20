package app.com.tmlpocket.feature.patches

import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class PatchRepositoryTest {
    @get:Rule val temporary = TemporaryFolder()

    @Test
    fun importIsDisabledByDefaultAndEnforcesTargetAtEnableAndLaunch() {
        val repo = PatchRepository(temporary.newFolder("patches"))
        val input =
            temporary.newFile().apply {
                writeText(
                    """{"format":1,"id":"language","name":"语言","targetVersion":"2026.10","launchArguments":["-lang","zh-Hans"]}"""
                )
            }
        repo.importFile(input)
        assertFalse(
            (0 until repo.list().length())
                .map { repo.list().getJSONObject(it) }
                .single { it.getString("id") == "language" }
                .getBoolean("enabled")
        )
        assertFails { repo.toggle("language", true, "2025.1") }
        repo.toggle("language", true, "2026.10.1")
        assertEquals(listOf("-lang", "zh-Hans"), repo.arguments("2026.10.2"))
        assertFails { repo.arguments("2025.1") }
        repo.delete("language")
        assertTrue(
            (0 until repo.list().length()).all {
                repo.list().getJSONObject(it).getBoolean("builtin")
            }
        )
    }

    @Test
    fun builtinsHaveIndependentSelectionAndCannotReplaceRequiredAdapters() {
        val directory = temporary.newFolder("builtin-patches")
        val repo = PatchRepository(directory)
        assertEquals(emptyList<String>(), repo.enabledBuiltinIds())
        assertFails { repo.toggle("mobile-touch", false, "2026.9.3.1") }
        assertFails { repo.delete("mobile-touch") }
        assertFails { repo.toggle("mobile-hosting", true, "2026.10.1.0") }
        repo.toggle("mobile-hosting", true, "v2026.09.3.1")
        repo.toggle("mobile-fps", true, "2026.9.3.1")
        assertEquals(
            setOf("mobile-hosting", "mobile-fps"),
            PatchRepository(directory).enabledBuiltinIds().toSet(),
        )
        assertEquals(emptyList<String>(), repo.arguments("v2026.09.3.1"))
        assertFails { repo.arguments("2026.10.1.0") }
        repo.toggle("mobile-hosting", false, "2026.10.1.0")
        assertEquals(emptyList<String>(), repo.arguments("2026.10.1.0"))
    }

    @Test
    fun rejectsPathsAndDirectoryArgumentOverrides() {
        val repo = PatchRepository(temporary.newFolder("patches"))
        val input =
            temporary.newFile().apply {
                writeText("""{"format":1,"id":"../outside","name":"bad","launchArguments":[]}""")
            }
        assertFails { repo.importFile(input) }
        assertFails { repo.delete("../outside") }
        assertFails { PatchRepository.validateArguments(listOf("-tmlsavedirectory", "/other")) }
        assertFails { PatchRepository.validateArguments(listOf("-modpath=/other")) }
    }

    private fun assertFails(action: () -> Unit) {
        try {
            action()
            fail("Expected rejection")
        } catch (_: Exception) {}
    }
}
