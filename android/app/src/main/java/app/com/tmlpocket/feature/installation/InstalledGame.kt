package app.com.tmlpocket.feature.installation

import java.io.File

enum class PackageKind {
    TERRARIA,
    TMODLOADER,
}

enum class TerrariaSource(val id: String) {
    STEAM("steam"),
    GOG("gog"),
}

data class InstalledTmlVersion(
    val id: String,
    val version: String,
    val active: Boolean,
    val available: Boolean,
)

data class InstalledGame(
    val tmlRoot: File,
    val terrariaRoot: File,
    val contentRoot: File,
    val version: String,
    val terrariaSource: TerrariaSource = TerrariaSource.STEAM,
)
