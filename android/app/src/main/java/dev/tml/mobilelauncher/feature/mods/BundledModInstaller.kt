package dev.tml.mobilelauncher.feature.mods

import java.io.File
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import org.json.JSONArray

/** Installs the APK-owned client mod while preserving user selections and differing copies. */
class BundledModInstaller(private val userData: File) {
    fun install(openPackage: () -> InputStream) {
        val root = File(userData, "Mods")
        require(!Files.isSymbolicLink(root.toPath())) { "模组目录不能是符号链接" }
        check(root.isDirectory || root.mkdirs()) { "无法创建模组目录" }
        val enabledFile = File(root, "enabled.json")
        require(!Files.isSymbolicLink(enabledFile.toPath())) { "模组清单不能是符号链接" }
        val enabled = if (enabledFile.isFile) JSONArray(enabledFile.readText()) else JSONArray()
        val selections = (0 until enabled.length()).map { enabled.getString(it) }.toMutableSet()
        val staged = File.createTempFile(".mobile-controls-", ".tmp", root)
        try {
            openPackage().use { input ->
                staged.outputStream().use { output ->
                    input.copyTo(output)
                    output.fd.sync()
                }
            }
            val metadata = TmodReader.read(staged, verifyHash = true)
            require(metadata.name == MOD_ID) { "内置触控模组标识不匹配" }
            val target = File(root, "$MOD_ID.tmod")
            require(!Files.isSymbolicLink(target.toPath())) { "内置触控模组不能是符号链接" }
            val expected = hash(staged)
            val previous =
                root.listFiles().orEmpty().filter { file ->
                    file.isFile &&
                        file.extension == "tmod" &&
                        (file.name == target.name ||
                            runCatching { TmodReader.read(file).name }.getOrNull() == MOD_ID)
                }
            previous.forEach { file ->
                require(!Files.isSymbolicLink(file.toPath())) { "触控模组副本不能是符号链接" }
                if (file != target || hash(file) != expected) {
                    val backup = File(root, ".launcher-backup")
                    require(!Files.isSymbolicLink(backup.toPath())) { "备份目录不能是符号链接" }
                    check(backup.isDirectory || backup.mkdirs()) { "无法创建触控模组备份" }
                    val saved = File(backup, "$MOD_ID-${hash(file)}.tmod.bak")
                    if (!saved.exists()) Files.copy(file.toPath(), saved.toPath())
                    require(hash(saved) == hash(file)) { "触控模组备份校验失败" }
                }
            }
            if (!target.isFile || hash(target) != expected) {
                Files.move(
                    staged.toPath(),
                    target.toPath(),
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING,
                )
            }
            // Alternative filenames for the same internal name would make tML reject duplicate
            // mods.
            previous.filter { it != target }.forEach { check(it.delete()) { "无法移除已备份的触控模组重复副本" } }
            if (selections.add(MOD_ID))
                ModRepository.write(enabledFile, JSONArray(selections.sorted()).toString(2))
        } finally {
            staged.delete()
        }
    }

    private fun hash(file: File): String =
        file.inputStream().use { input ->
            val digest = MessageDigest.getInstance("SHA-256")
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val size = input.read(buffer)
                if (size < 0) break
                digest.update(buffer, 0, size)
            }
            digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
        }

    companion object {
        const val MOD_ID = "MobileJoystick"
    }
}
