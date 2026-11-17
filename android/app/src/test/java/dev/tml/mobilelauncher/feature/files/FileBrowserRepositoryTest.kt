package dev.tml.mobilelauncher.feature.files

import java.io.File
import java.nio.file.Files
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeNoException
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class FileBrowserRepositoryTest {
    @get:Rule val temporary = TemporaryFolder()
    private val root by lazy { temporary.newFolder("public") }
    private val repository by lazy {
        FileBrowserRepository(listOf(BrowserRoot("storage", "内部存储", root, true)))
    }

    private fun params(kind: String = "tml", path: String = "") =
        JSONObject().put("root", "storage").put("path", path).put("kind", kind)

    private fun create(path: String, content: String = "asset") =
        File(root, path).apply {
            parentFile!!.mkdirs()
            writeText(content)
        }

    private fun selection(vararg paths: String) =
        JSONArray(paths.map { JSONObject().put("root", "storage").put("path", it) })

    private fun fails(action: () -> Unit) {
        try {
            action()
            fail("Expected rejected operation")
        } catch (_: IllegalArgumentException) {} catch (_: IllegalStateException) {}
    }

    @Test
    fun listingFiltersFormatsAndOrdersFoldersFirst() {
        create("z-folder/sub/readme.txt")
        create("b.ZIP")
        create("a.zip")
        create("setup.sh")
        create(".hidden.zip")
        val entries = repository.list(params()).getJSONArray("entries")
        assertEquals(
            listOf("z-folder", "a.zip", "b.ZIP"),
            (0 until entries.length()).map { entries.getJSONObject(it).getString("name") },
        )
        assertEquals(
            "setup.sh",
            repository
                .list(params("terraria-gog").put("query", "setup"))
                .getJSONArray("entries")
                .getJSONObject(0)
                .getString("name"),
        )
    }

    @Test
    fun searchPaginationAndSizeSortingAreBounded() {
        repeat(205) { create("item-${it.toString().padStart(3, '0')}.zip", "x".repeat(it + 1)) }
        assertEquals(100, repository.list(params()).getJSONArray("entries").length())
        val last = repository.list(params().put("offset", 200))
        assertEquals(5, last.getJSONArray("entries").length())
        assertFalse(last.getBoolean("hasMore"))
        assertEquals(205, last.getInt("total"))
        assertEquals(
            "item-204.zip",
            repository
                .list(params().put("sort", "size"))
                .getJSONArray("entries")
                .getJSONObject(0)
                .getString("name"),
        )
        assertEquals(5, repository.list(params().put("query", "item-20")).getInt("total"))
    }

    @Test
    fun rejectsTraversalUnknownRootsAndProtectedAndroidDirectories() {
        create("Android/data/app/private.zip")
        create("Android/obb/game.zip")
        create("normal.zip")
        for (path in
            listOf(
                "../outside.zip",
                "/normal.zip",
                "a/../normal.zip",
                "a\\b.zip",
                "C:/normal.zip",
                "Android/data/app/private.zip",
                "Android/obb/game.zip",
            )) {
            fails { repository.resolve("storage", path) }
        }
        fails { repository.resolve("private", "normal.zip") }
        val android = repository.list(params(path = "Android")).getJSONArray("entries")
        assertEquals(0, android.length())
    }

    @Test
    fun selectionValidatesFormatCountDuplicatesAndDeletedFiles() {
        create("a.zip")
        create("a.tmod")
        create("b.tmod")
        create("setup.sh")
        fails { repository.selection("terraria-gog", selection("a.zip")) }
        fails { repository.selection("tml", selection("a.zip", "a.zip")) }
        fails { repository.selection("mod", selection("a.tmod", "a.tmod")) }
        assertEquals(2, repository.selection("mod", selection("a.tmod", "b.tmod")).size)
        fails { repository.selection("mod", JSONArray()) }
        fails {
            repository.selection(
                "mod",
                JSONArray(
                    (0..100).map { JSONObject().put("root", "storage").put("path", "a.tmod") }
                ),
            )
        }
        File(root, "a.zip").delete()
        fails { repository.selection("tml", selection("a.zip")) }
    }

    @Test
    fun symbolicLinksCannotExposeOtherFilesOrDirectories() {
        val outside = temporary.newFolder("outside")
        File(outside, "secret.zip").writeText("private")
        try {
            Files.createSymbolicLink(File(root, "alias").toPath(), outside.toPath())
        } catch (failure: Exception) {
            assumeNoException(failure)
        }
        fails { repository.resolve("storage", "alias/secret.zip") }
        assertEquals(0, repository.list(params()).getJSONArray("entries").length())
    }

    @Test
    fun exportPreservesExistingFileAndRejectsUnsafeNames() {
        create("Downloads/keep.json", "original")
        fails { repository.export("storage", "Downloads", "keep.json", "replacement") }
        assertEquals("original", File(root, "Downloads/keep.json").readText())
        for (name in listOf("../other.json", ".secret.json", "bad.txt", "a/b.json", "")) fails {
            repository.export("storage", "Downloads", name, "[]")
        }
        repository.export("storage", "Downloads", "new.json", "[\"mod\"]")
        assertEquals("[\"mod\"]", File(root, "Downloads/new.json").readText())
        fails { repository.export("storage", "Downloads", "large.json", "x".repeat(200001)) }
        assertFalse(File(root, "Downloads/large.json").exists())
    }

    @Test
    fun rootsDoNotAcceptStalePermissionsOrExposeInternalDirectories() {
        create("game.zip")
        val denied = FileBrowserRepository(emptyList())
        assertEquals(0, denied.roots().length())
        fails { denied.selection("tml", selection("game.zip")) }
        assertEquals(root.absolutePath, repository.roots().getJSONObject(0).getString("path"))
    }
}
