package dev.tml.mobilelauncher.feature.releases

data class TmlRelease(
    val id: Long,
    val tag: String,
    val name: String,
    val preview: Boolean,
    val downloadUrl: String,
    val size: Long,
    val digest: String?
)

data class TmlReleasePage(val releases: List<TmlRelease>, val hasMore: Boolean)
