package app.com.tmlpocket.feature.mods

import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.UUID
import org.json.JSONArray

internal object LegacyTouchMod {
    const val ID = "MobileJoystick"

    @Synchronized
    fun migrate(userData: File) {
        val mods = File(userData, "Mods")
        if (!mods.isDirectory) return
        require(!Files.isSymbolicLink(mods.toPath())) { "模组目录不能是符号链接" }
        val enabledFile = File(mods, "enabled.json")
        require(!Files.isSymbolicLink(enabledFile.toPath())) { "模组清单不能是符号链接" }
        val selected = if (enabledFile.isFile) JSONArray(enabledFile.readText()) else JSONArray()
        val remaining = (0 until selected.length()).map(selected::getString).filter { it != ID }
        mods.listFiles().orEmpty().filter { file ->
            file.isFile && !Files.isSymbolicLink(file.toPath()) && file.extension.equals("tmod", true) &&
                (file.name.equals("$ID.tmod", true) || runCatching { TmodReader.read(file).name }.getOrNull() == ID)
        }.forEach { file ->
            val backup = File(mods, ".launcher-backup")
            require(!Files.isSymbolicLink(backup.toPath())) { "模组备份目录不能是符号链接" }
            check(backup.isDirectory || backup.mkdirs()) { "无法创建模组备份目录" }
            val target = File(backup, "$ID-${UUID.randomUUID()}.tmod.bak")
            Files.move(file.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE)
        }
        if (remaining.size != selected.length()) {
            ModRepository.write(enabledFile, JSONArray(remaining).toString(2))
        }
    }
}
