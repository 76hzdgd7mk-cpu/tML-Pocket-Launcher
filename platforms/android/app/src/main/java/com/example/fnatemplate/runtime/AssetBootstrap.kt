package com.example.fnatemplate.runtime

import android.content.Context
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.tukaani.xz.XZInputStream
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption

data class PreparedGame(
    val assemblyPath: String,
    val runtimeRoot: String,
    val workingDirectory: String,
    val arguments: Array<String>
)

object AssetBootstrap {
    private const val TAG = "FnaAndroidCoreClr"
    private const val RUNTIME_ASSET = "runtime/dotnet.tar.xz"
    private const val GAME_ASSET = "game"

    fun prepare(context: Context, arguments: Array<String>): PreparedGame {
        val runtimeRoot = File(context.filesDir, "runtime")
        val gameRoot = File(context.filesDir, "game")
        val manifestFile = File(gameRoot, "manifest.json")

        if (!runtimeIsReady(runtimeRoot)) {
            val staging = File(context.filesDir, "runtime.staging")
            staging.deleteRecursively()
            staging.mkdirs()
            extractRuntime(context, staging)
            replaceDirectory(staging, runtimeRoot)
        }

        if (!manifestFile.isFile) {
            val staging = File(context.filesDir, "game.staging")
            staging.deleteRecursively()
            staging.mkdirs()
            copyAssetTree(context, GAME_ASSET, staging)
            replaceDirectory(staging, gameRoot)
        }

        val manifest = requireFile(manifestFile, "game manifest")
        val json = JSONObject(manifest.readText(Charsets.UTF_8))
        val assemblyName = json.optString("assembly").trim()
        require(assemblyName.isNotEmpty()) { "game manifest has no assembly" }

        val assembly = File(gameRoot, assemblyName)
        require(assembly.isFile) { "game assembly missing: ${assembly.absolutePath}" }
        require(runtimeIsReady(runtimeRoot)) { "CoreCLR runtime is incomplete: ${runtimeRoot.absolutePath}" }

        return PreparedGame(
            assemblyPath = assembly.absolutePath,
            runtimeRoot = runtimeRoot.absolutePath,
            workingDirectory = gameRoot.absolutePath,
            arguments = arguments
        )
    }

    private fun runtimeIsReady(root: File): Boolean {
        if (!root.isDirectory) return false
        val hostfxr = root.walkTopDown().firstOrNull { it.name == "libhostfxr.so" }
        val coreclr = root.walkTopDown().firstOrNull { it.name == "libcoreclr.so" }
        return hostfxr?.isFile == true && coreclr?.isFile == true
    }

    private fun extractRuntime(context: Context, targetRoot: File) {
        val archive = File(context.cacheDir, "dotnet.tar.xz")
        context.assets.open(RUNTIME_ASSET).use { input ->
            FileOutputStream(archive).use { output -> input.copyTo(output) }
        }

        val rootCanonical = targetRoot.canonicalFile
        TarArchiveInputStream(XZInputStream(BufferedInputStream(FileInputStream(archive)))).use { tar ->
            while (true) {
                val entry = tar.nextTarEntry ?: break
                val name = entry.name.removePrefix("dotnet/")
                if (name.isEmpty()) continue
                val output = File(targetRoot, name)
                require(output.canonicalFile.path.startsWith(rootCanonical.path + File.separator)) {
                    "runtime archive contains an unsafe path: ${entry.name}"
                }
                if (entry.isDirectory) {
                    output.mkdirs()
                } else if (!entry.isSymbolicLink && !entry.isLink) {
                    output.parentFile?.mkdirs()
                    BufferedOutputStream(FileOutputStream(output)).use { tar.copyTo(it) }
                    if (name == "dotnet" || name.endsWith(".so")) {
                        require(output.setExecutable(true, false)) {
                            "failed to mark runtime file executable: ${output.absolutePath}"
                        }
                    }
                }
            }
        }
        archive.delete()
    }

    private fun copyAssetTree(context: Context, assetPath: String, target: File) {
        val children = context.assets.list(assetPath).orEmpty()
        if (children.isEmpty()) {
            target.parentFile?.mkdirs()
            context.assets.open(assetPath).use { input ->
                FileOutputStream(target).use { outputStream -> input.copyTo(outputStream) }
            }
            return
        }

        for (child in children) {
            copyAssetTree(context, "$assetPath/$child", File(target, child))
        }
    }

    private fun replaceDirectory(staging: File, target: File) {
        if (target.exists()) target.deleteRecursively()
        Files.move(staging.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE)
    }

    private fun requireFile(file: File, description: String): File {
        require(file.isFile) { "$description missing: ${file.absolutePath}" }
        return file
    }
}
