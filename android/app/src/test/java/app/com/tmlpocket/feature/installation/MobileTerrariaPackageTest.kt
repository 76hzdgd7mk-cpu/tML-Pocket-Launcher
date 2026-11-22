package app.com.tmlpocket.feature.installation

import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class MobileTerrariaPackageTest {
    @get:Rule val temp = TemporaryFolder()

    @Test
    fun findsBundleAndStreamAcrossSplitApks() {
        val base = archive("base.apk", "data.unity3d", "UnityFS\u0000bundle")
        val split = archive("split_assets.apk", "resources.resource", "stream")
        assertTrue(MobileTerrariaPackage.inspectArchives(listOf(base, split)))
        assertFalse(MobileTerrariaPackage.inspectArchives(listOf(base)))
    }

    @Test
    fun rejectsDifferentBundleHeader() {
        val base = archive("base.apk", "data.unity3d", "not a bundle")
        val split = archive("split_assets.apk", "resources.resource", "stream")
        assertFalse(MobileTerrariaPackage.inspectArchives(listOf(base, split)))
    }

    private fun archive(name: String, resourceName: String, content: String): File =
        temp.newFile(name).also { file ->
            ZipOutputStream(file.outputStream()).use { zip ->
                zip.putNextEntry(ZipEntry("assets/bin/Data/$resourceName"))
                zip.write(content.toByteArray(Charsets.US_ASCII))
                zip.closeEntry()
            }
        }
}
