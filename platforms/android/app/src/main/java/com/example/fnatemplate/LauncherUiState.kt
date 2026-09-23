package com.example.fnatemplate

sealed interface LauncherUiState {
    data class Downloading(
        val title: String,
        val detail: String,
        val progressPercent: Int,
        val indeterminate: Boolean,
        val completedFiles: Int?,
        val totalFiles: Int?,
        val downloadedBytes: String?,
        val totalBytes: String?,
        val speed: String?,
        val currentFile: String?
    ) : LauncherUiState

    data class Installing(
        val title: String,
        val detail: String
    ) : LauncherUiState

    data class Paused(
        val title: String,
        val detail: String
    ) : LauncherUiState

    data class Ready(
        val version: String,
        val detail: String
    ) : LauncherUiState

    data class Launching(
        val title: String,
        val detail: String,
        val progressPercent: Int
    ) : LauncherUiState

    data class Failed(
        val title: String,
        val detail: String
    ) : LauncherUiState
}

enum class LauncherAction {
    Pause,
    Resume,
    Retry,
    Cancel,
    Launch,
    Recheck
}

fun parseLauncherState(
    title: String,
    detail: String,
    progressPercent: Int
): LauncherUiState {
    val normalizedTitle = title.trim().lowercase()

    return when {
        normalizedTitle.contains("fail") || normalizedTitle.contains("error") ->
            LauncherUiState.Failed(title, detail)
        normalizedTitle.contains("pause") ->
            LauncherUiState.Paused(title, detail)
        normalizedTitle.contains("ready") ->
            LauncherUiState.Ready(BuildConfig.VERSION_NAME, detail)
        normalizedTitle.contains("download") ->
            parseDownloadingState(title, detail, progressPercent)
        normalizedTitle.contains("content") || normalizedTitle.contains("install") ->
            LauncherUiState.Installing(title, detail)
        normalizedTitle.contains("start") || normalizedTitle.contains("launch") ->
            LauncherUiState.Launching(title, detail, progressPercent)
        else ->
            LauncherUiState.Installing(title, detail)
    }
}

private fun parseDownloadingState(
    title: String,
    detail: String,
    progressPercent: Int
): LauncherUiState.Downloading {
    val fields = detail.split("  ", limit = 4)
    val fileCountFields = fields.getOrNull(1)
        ?.trim()
        ?.takeIf { it.endsWith(" files") }
        ?.removeSuffix(" files")
        ?.split('/', limit = 2)
        ?.takeIf { it.size == 2 }
        ?.map { it.trim() }
        ?.takeIf { it.all { value -> value.toIntOrNull() != null } }
    val byteFields = fields.getOrNull(2)
        ?.split('/', limit = 2)
        ?.takeIf { it.size == 2 }
        ?.map { it.trim() }
        ?.takeIf { it.all(String::isNotEmpty) }
    val currentFile = fields.getOrNull(3)
        ?.trim()
        ?.takeIf(String::isNotEmpty)

    return LauncherUiState.Downloading(
        title = title,
        detail = detail,
        progressPercent = progressPercent,
        indeterminate = progressPercent == -1,
        completedFiles = fileCountFields?.get(0)?.toIntOrNull(),
        totalFiles = fileCountFields?.get(1)?.toIntOrNull(),
        downloadedBytes = byteFields?.get(0),
        totalBytes = byteFields?.get(1),
        speed = null,
        currentFile = currentFile
    )
}
