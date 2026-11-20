package app.com.tmlpocket.feature.installation

import java.io.EOFException
import java.io.File
import java.io.IOException
import java.nio.file.FileVisitResult
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.Path
import java.nio.file.SimpleFileVisitor
import java.nio.file.StandardCopyOption
import java.nio.file.attribute.BasicFileAttributes
import java.util.Locale
import java.util.UUID
import java.util.concurrent.CancellationException
import java.util.zip.CRC32
import java.util.zip.ZipException
import org.apache.commons.compress.archivers.zip.ZipFile
import org.json.JSONArray
import org.json.JSONObject

/** Imports desktop ZIP layouts without modifying launcher files or user saves. */
class GamePackageInstaller(private val filesDir: File) {
    private val gamesDir
        get() = File(filesDir, "games")

    private val stateFile
        get() = File(filesDir, "installed-packages.json")

    private val journalFile
        get() = File(filesDir, ".package-install-transaction.json")

    fun importPackage(
        kind: PackageKind,
        archive: File,
        version: String? = null,
        cancelled: () -> Boolean = { false },
        progress: (String, Int) -> Unit = { _, _ -> },
        source: TerrariaSource = TerrariaSource.STEAM,
    ) =
        synchronized(installLock) {
            checkCancelled(cancelled)
            requireDirectory(filesDir)
            requireDirectory(gamesDir)
            val state = readState()
            val oldState = JSONObject(state.toString())
            val transaction = UUID.randomUUID().toString()
            val staging = File(gamesDir, ".import-$transaction")
            requireDirectory(staging)
            var journal: JSONObject? = null
            try {
                progress("Extracting package", 0)
                try {
                    extract(archive, staging, cancelled, progress)
                } catch (failure: IOException) {
                    val archiveFailure =
                        generateSequence<Throwable>(failure) { it.cause }.firstOrNull {
                            it is EOFException || it is ZipException
                        } ?: throw failure
                    val detail =
                        archiveFailure.message?.takeIf { it.isNotBlank() }
                            ?: "压缩数据意外结束或 ZIP 结构无效"
                    throw IOException(
                        "安装包 ZIP 已损坏或下载不完整，请重新下载后导入。\n" +
                            "详细信息：${archiveFailure.javaClass.simpleName}：$detail",
                        failure,
                    )
                }
                checkCancelled(cancelled)
                progress("Validating package", 90)
                val layout = validate(kind, staging)
                val resolvedVersion =
                    version
                        ?.trim()
                        ?.takeIf { it.isNotEmpty() }
                        ?.let { PackageVersionReader.installed(kind, it, layout.version) }
                        ?: layout.version
                val record =
                    JSONObject()
                        .put("root", relative(staging, layout.root))
                        .put("content", relative(staging, layout.content))
                        .put("version", resolvedVersion)
                val versionId =
                    if (kind == PackageKind.TMODLOADER) {
                        val catalog = TmlVersionCatalog(state)
                        catalog.installId(resolvedVersion).also { id ->
                            catalog.records[id] = record
                            catalog.activeId = id
                            catalog.persist()
                        }
                    } else {
                        record.put("source", source.id)
                        state.put(kind.name, record)
                        null
                    }
                val destination = packageDirectory(kind, versionId)
                rejectLink(destination)
                state.put("_transaction", transaction)
                progress("Installing package", 95)
                val pending =
                    newTransaction(transaction, kind, versionId, oldState, state)
                journal = pending
                commitTransaction(pending, cancelled)
            } catch (failure: Exception) {
                try {
                    // A failed atomic metadata write has not committed. Roll back even if
                    // the failing filesystem no longer permits reading the old manifest.
                    journal?.let { rollbackTransaction(it) } ?: deleteTree(staging)
                } catch (rollbackFailure: Exception) {
                    // Keep journal and backup for the next startup if storage itself failed.
                    failure.addSuppressed(rollbackFailure)
                }
                throw failure
            }
            // Metadata is now the commit marker. Cleanup can be resumed after process death.
            runCatching { recoverTransaction() }
            // A UI callback failure after commit must not report an unsuccessful import.
            runCatching { progress("Package installed", 100) }
            Unit
        }

    fun installedVersions(): List<InstalledTmlVersion> =
        synchronized(installLock) {
            val catalog = TmlVersionCatalog(readState())
            catalog.records
                .map { (id, record) ->
                    val layout = runCatching { versionLayout(id, record) }.getOrNull()
                    InstalledTmlVersion(
                        id,
                        layout?.version ?: record.optString("version", "未知版本"),
                        catalog.activeId == id,
                        layout != null,
                    )
                }
                .sortedWith(
                    compareByDescending<InstalledTmlVersion> { it.active }
                        .thenByDescending { it.version }
                )
        }

    fun selectVersion(id: String) =
        synchronized(installLock) {
            val state = readState()
            val catalog = TmlVersionCatalog(state)
            val record = catalog.requireRecord(id)
            val available = runCatching { versionLayout(id, record) != null }
            if (!available.getOrDefault(false)) {
                throw IOException("所选 tML 版本文件缺失或已损坏，请重新安装。", available.exceptionOrNull())
            }
            catalog.activeId = id
            catalog.persist()
            writeState(state)
        }

    fun uninstallVersion(
        id: String,
        cancelled: () -> Boolean = { false },
        progress: (String, Int) -> Unit = { _, _ -> },
    ) =
        synchronized(installLock) {
            checkCancelled(cancelled)
            val state = readState()
            val oldState = JSONObject(state.toString())
            val catalog = TmlVersionCatalog(state)
            catalog.requireRecord(id)
            catalog.records.remove(id)
            if (catalog.activeId == id) {
                catalog.activeId =
                    catalog.records.entries.firstOrNull { (otherId, record) ->
                        runCatching { versionLayout(otherId, record) != null }.getOrDefault(false)
                    }?.key
            }
            catalog.persist()
            val transaction = UUID.randomUUID().toString()
            state.put("_transaction", transaction)
            val staging = File(gamesDir, ".import-$transaction")
            requireDirectory(staging)
            var journal: JSONObject? = null
            try {
                progress("正在卸载所选 tML 版本…", 95)
                val pending =
                    newTransaction(
                        transaction,
                        PackageKind.TMODLOADER,
                        id,
                        oldState,
                        state,
                        removing = true,
                    )
                journal = pending
                commitTransaction(pending, cancelled)
            } catch (failure: Exception) {
                try {
                    journal?.let(::rollbackTransaction) ?: deleteTree(staging)
                } catch (rollbackFailure: Exception) {
                    failure.addSuppressed(rollbackFailure)
                }
                throw failure
            }
            runCatching { recoverTransaction() }
            runCatching { progress("所选 tML 版本已卸载，存档与模组已保留。", 100) }
            Unit
        }

    private fun newTransaction(
        transaction: String,
        kind: PackageKind,
        versionId: String?,
        oldState: JSONObject,
        state: JSONObject,
        removing: Boolean = false,
    ): JSONObject =
        JSONObject()
            .put("format", if (versionId == null) 1 else 2)
            .put("id", transaction)
            .put("kind", kind.name)
            .put("versionId", versionId)
            .put("operation", if (removing) "uninstall" else "install")
            .put("phase", "prepared")
            .put("hadDestination", packageDirectory(kind, versionId).exists())
            .put("hadStateFile", stateFile.exists())
            .put("oldState", oldState)
            .put("newState", state)

    private fun commitTransaction(pending: JSONObject, cancelled: () -> Boolean) {
        val transaction = parseTransaction(pending)
        verifyTransactionDirectories(transaction)
        val destination = packageDirectory(transaction.kind, transaction.versionId)
        val backup = File(gamesDir, ".backup-${transaction.id}")
        val staging = File(gamesDir, ".import-${transaction.id}")
        // The durable journal precedes the first rename of an installed package.
        writeJsonAtomic(journalFile, pending)
        checkCancelled(cancelled)
        if (destination.exists()) Files.move(destination.toPath(), backup.toPath())
        checkCancelled(cancelled)
        if (!transaction.removing) Files.move(staging.toPath(), destination.toPath())
        checkCancelled(cancelled)
        writeState(transaction.newState)
    }

    fun installation(): InstalledGame? =
        synchronized(installLock) {
            runCatching {
                    val state = readState()
                    val tml =
                        installedLayout(PackageKind.TMODLOADER, state) ?: return@synchronized null
                    val terraria =
                        installedLayout(PackageKind.TERRARIA, state) ?: return@synchronized null
                    InstalledGame(
                        tml.root,
                        terraria.root,
                        terraria.content,
                        tml.version,
                        sourceFrom(state),
                    )
                }
                .getOrNull()
        }

    /** Null indicates missing, damaged, or unvalidated package data. */
    fun packageStatus(kind: PackageKind): String? =
        synchronized(installLock) {
            runCatching { installedLayout(kind, readState())?.version }.getOrNull()
        }

    fun terrariaSource(): TerrariaSource? =
        synchronized(installLock) {
            runCatching {
                    val state = readState()
                    installedLayout(PackageKind.TERRARIA, state) ?: return@synchronized null
                    sourceFrom(state)
                }
                .getOrNull()
        }

    // Older installations and unrecognized metadata never imply a DRM-free source.
    private fun sourceFrom(state: JSONObject): TerrariaSource =
        if (state.optJSONObject(PackageKind.TERRARIA.name)?.optString("source") == "gog")
            TerrariaSource.GOG
        else TerrariaSource.STEAM

    private data class Layout(val root: File, val content: File, val version: String)

    private fun installedLayout(kind: PackageKind, state: JSONObject): Layout? {
        if (kind == PackageKind.TMODLOADER) {
            val catalog = TmlVersionCatalog(state)
            val id = catalog.activeId ?: return null
            return versionLayout(id, catalog.requireRecord(id))
        }
        val record = state.optJSONObject(kind.name) ?: return null
        return recordedLayout(kind, packageDirectory(kind), record)
    }

    private fun versionLayout(id: String, record: JSONObject) =
        recordedLayout(PackageKind.TMODLOADER, packageDirectory(PackageKind.TMODLOADER, id), record)

    private fun recordedLayout(kind: PackageKind, directory: File, record: JSONObject): Layout? {
        rejectLink(filesDir)
        rejectLink(gamesDir)
        rejectLink(directory)
        val layout = validate(kind, directory)
        if (
            relative(directory, layout.root) != record.getString("root") ||
                relative(directory, layout.content) != record.getString("content")
        )
            return null
        return layout.copy(
            version =
                PackageVersionReader.installed(kind, record.getString("version"), layout.version)
        )
    }

    private fun validate(kind: PackageKind, directory: File): Layout {
        if (!directory.isDirectory) throw IOException("Package directory is missing")
        // Metadata and archive contents cannot nominate paths outside the package.
        val files =
            directory
                .walkTopDown()
                .onEnter {
                    rejectLink(it)
                    true
                }
                .toList()
        files.forEach { rejectLink(it) }
        if (kind == PackageKind.TERRARIA) {
            val contents =
                files.filter { it.isDirectory && it.name == "Content" && validContent(it) }
            val content =
                when {
                    contents.size == 1 -> contents.single()
                    contents.isEmpty() && validContent(directory) -> directory
                    else ->
                        throw IOException(
                            "Terraria ZIP must contain one Content directory with Images resources"
                        )
                }
            val root = if (content == directory) directory else requireNotNull(content.parentFile)
            return Layout(root, content, PackageVersionReader.terraria(root, files))
        }

        val assemblies =
            files.filter { it.isFile && it.name == "tModLoader.dll" && it.length() > 0 }
        if (assemblies.size != 1)
            throw IOException("ZIP must contain one modern tModLoader.dll installation")
        val root = requireNotNull(assemblies.single().parentFile)
        val deps = readJson(requiredFile(root, "tModLoader.deps.json"))
        val runtime =
            readJson(requiredFile(root, "tModLoader.runtimeconfig.json"))
                .getJSONObject("runtimeOptions")
        val frameworks = buildList {
            runtime.optJSONObject("framework")?.let { add(it) }
            runtime.optJSONArray("frameworks")?.let { array ->
                for (index in 0 until array.length()) add(array.getJSONObject(index))
            }
        }
        if (
            frameworks.none {
                it.optString("name") == "Microsoft.NETCore.App" &&
                    (it.optString("version").substringBefore('.').toIntOrNull() ?: 0) >= 6
            }
        )
            throw IOException(
                "tModLoader requires a modern Microsoft.NETCore.App runtime configuration"
            )

        val targetName = deps.getJSONObject("runtimeTarget").getString("name")
        val target = deps.getJSONObject("targets").getJSONObject(targetName)
        val libraries = deps.getJSONObject("libraries")
        val libraryFiles =
            files
                .filter {
                    it.isFile &&
                        it.length() > 0 &&
                        it.toPath().startsWith(File(root, "Libraries").toPath())
                }
                .groupBy { it.name }
        var foundFna = false
        var detectedVersion = "Imported tModLoader"
        for (library in target.keys()) {
            if (library.startsWith("tModLoader/", ignoreCase = true)) {
                detectedVersion = library.substringAfter('/')
            }
            val entry = target.getJSONObject(library)
            val assets = entry.optJSONObject("runtime") ?: continue
            for (asset in assets.keys()) {
                if (!asset.endsWith(".dll", ignoreCase = true)) continue
                val libraryPath = libraries.optJSONObject(library)?.optString("path").orEmpty()
                val candidates =
                    listOf(
                        asset,
                        "Libraries/$asset",
                        "$libraryPath/$asset",
                        "Libraries/$libraryPath/$asset",
                        "Libraries/$library/$asset",
                    )
                val resolved =
                    candidates
                        .asSequence()
                        .mapNotNull { safeAsset(root, it) }
                        .firstOrNull { it.isFile && it.length() > 0 }
                        // tML relocates flat project/reference assets into Libraries/Name/Version.
                        // FNA.Reference and FNA may both describe the same shipped FNA.dll.
                        ?: (if (
                            !asset.contains('/') && !asset.contains('\\') && !asset.contains(':')
                        )
                            libraryFiles[asset]?.singleOrNull()
                        else null)
                        ?: throw IOException("tModLoader managed dependency is missing: $asset")
                if (resolved.name.equals("FNA.dll", ignoreCase = true)) foundFna = true
            }
        }
        // Some releases ship FNA outside the runtime asset list.
        if (!foundFna)
            foundFna =
                files.any {
                    it.isFile &&
                        it.name == "FNA.dll" &&
                        it.length() > 0 &&
                        (it.parentFile == root ||
                            it.toPath().startsWith(File(root, "Libraries/FNA").toPath()))
                }
        if (!foundFna) throw IOException("tModLoader managed FNA.dll is missing")
        val content = File(root, "Content")
        if (!content.isDirectory || content.walkTopDown().none { it.isFile && it.length() > 0 }) {
            throw IOException("tModLoader Content resources are missing")
        }
        return Layout(root, content, PackageVersionReader.tml(assemblies.single(), detectedVersion))
    }

    private fun validContent(directory: File) =
        File(directory, "Images").let { images ->
            images.isDirectory &&
                images.walkTopDown().any {
                    it.isFile && it.extension.equals("xnb", true) && it.length() > 0
                }
        }

    private fun safeAsset(root: File, path: String): File? {
        if (path.isBlank() || path.startsWith('/') || path.contains('\\') || path.contains(':'))
            return null
        if (path.split('/').any { it == ".." }) return null
        return File(root, path).takeIf {
            it.canonicalFile.toPath().startsWith(root.canonicalFile.toPath())
        }
    }

    private fun extract(
        archive: File,
        staging: File,
        cancelled: () -> Boolean,
        progress: (String, Int) -> Unit,
    ) {
        if (!archive.isFile || archive.length() > MAX_ARCHIVE_BYTES)
            throw IOException("Invalid or oversized ZIP archive")
        ZipFile.builder().setFile(archive).get().use { zip ->
            val entries = zip.entries.toList()
            if (entries.isEmpty() || entries.size > MAX_ENTRIES)
                throw IOException("ZIP has an invalid entry count")
            val paths = mutableMapOf<String, String>()
            val explicitPaths = mutableSetOf<String>()
            var declaredTotal = 0L
            for (entry in entries) {
                checkCancelled(cancelled)
                val name = checkedPath(entry.name)
                val mode = entry.unixMode and 0xF000
                if (entry.isUnixSymlink || mode !in listOf(0, 0x8000, 0x4000))
                    throw IOException("ZIP links and special files are unsupported")
                if (!zip.canReadEntryData(entry))
                    throw IOException("Unsupported ZIP compression or encryption")
                if (!explicitPaths.add(name.lowercase(Locale.ROOT)))
                    throw IOException("Duplicate ZIP path: $name")
                var parent = ""
                for (segment in name.split('/')) {
                    parent = if (parent.isEmpty()) segment else "$parent/$segment"
                    val key = parent.lowercase(Locale.ROOT)
                    val previous = paths.putIfAbsent(key, parent)
                    if (previous != null && previous != parent)
                        throw IOException("ZIP contains conflicting case: $parent")
                }
                if (entry.size < 0 || entry.size > MAX_FILE_BYTES)
                    throw IOException("ZIP entry has an invalid size")
                declaredTotal += entry.size
                if (declaredTotal > MAX_EXTRACTED_BYTES)
                    throw IOException("ZIP expands beyond the package size limit")
            }
            if (staging.usableSpace < declaredTotal + SPACE_RESERVE)
                throw IOException("Insufficient space to import package")
            var total = 0L
            val buffer = ByteArray(64 * 1024)
            for ((index, entry) in entries.withIndex()) {
                checkCancelled(cancelled)
                val output = File(staging, checkedPath(entry.name))
                if (entry.isDirectory) {
                    requireDirectory(output)
                } else {
                    requireDirectory(requireNotNull(output.parentFile))
                    var count = 0L
                    val crc = CRC32()
                    zip.getInputStream(entry).use { input ->
                        output.outputStream().use { stream ->
                            while (true) {
                                checkCancelled(cancelled)
                                val read = input.read(buffer)
                                if (read < 0) break
                                count += read
                                total += read
                                if (
                                    count > entry.size ||
                                        count > MAX_FILE_BYTES ||
                                        total > MAX_EXTRACTED_BYTES
                                ) {
                                    throw IOException("ZIP exceeds its declared or permitted size")
                                }
                                stream.write(buffer, 0, read)
                                crc.update(buffer, 0, read)
                            }
                        }
                    }
                    if (count != entry.size || crc.value != entry.crc)
                        throw ZipException("ZIP entry checksum or length mismatch: ${entry.name}")
                }
                progress("Extracting ${entry.name}", ((index + 1L) * 85 / entries.size).toInt())
            }
        }
    }

    private fun checkedPath(raw: String): String {
        val name = raw.removeSuffix("/")
        if (
            name.isEmpty() ||
                name.length > 1024 ||
                name.startsWith('/') ||
                name.contains('\\') ||
                name.contains(':')
        ) {
            throw IOException("Unsafe ZIP path: $raw")
        }
        for (segment in name.split('/')) {
            if (
                segment.isEmpty() ||
                    segment == "." ||
                    segment == ".." ||
                    segment.endsWith('.') ||
                    segment.endsWith(' ') ||
                    segment.any { it.code < 32 } ||
                    WINDOWS_DEVICE.matches(segment.substringBefore('.'))
            ) {
                throw IOException("Unsafe ZIP path: $raw")
            }
        }
        return name
    }

    private fun readState(): JSONObject {
        recoverTransaction()
        return readStateWithoutRecovery()
    }

    private fun readStateWithoutRecovery(): JSONObject {
        rejectLink(stateFile)
        return if (stateFile.exists()) readJson(stateFile) else JSONObject()
    }

    private data class InstallTransaction(
        val json: JSONObject,
        val id: String,
        val kind: PackageKind,
        val versionId: String?,
        val removing: Boolean,
        val phase: String,
        val hadDestination: Boolean,
        val hadStateFile: Boolean,
        val oldState: JSONObject,
        val newState: JSONObject,
    )

    private fun parseTransaction(json: JSONObject): InstallTransaction {
        val id = json.getString("id")
        // Paths are derived from a canonical UUID and enum, never supplied by the journal.
        val format = json.getInt("format")
        if (format !in 1..2 || UUID.fromString(id).toString() != id) {
            throw IOException("Invalid package transaction identifier")
        }
        val kind = PackageKind.valueOf(json.getString("kind"))
        val versionId =
            if (format == 2) json.getString("versionId").also(TmlVersionCatalog::checkId)
            else null
        val removing = format == 2 && json.getString("operation") == "uninstall"
        if (
            format == 2 &&
                (kind != PackageKind.TMODLOADER ||
                    json.getString("operation") !in setOf("install", "uninstall"))
        )
            throw IOException("Invalid version transaction operation")
        val phase = json.getString("phase")
        if (phase != "prepared" && phase != "rolling-back")
            throw IOException("Invalid package transaction phase")
        val hadDestination =
            json.get("hadDestination") as? Boolean
                ?: throw IOException("Invalid package transaction destination flag")
        val hadStateFile =
            json.get("hadStateFile") as? Boolean
                ?: throw IOException("Invalid package transaction manifest flag")
        val oldState = json.getJSONObject("oldState")
        val newState = json.getJSONObject("newState")
        if (
            newState.getString("_transaction") != id ||
                (format == 1 && newState.optJSONObject(kind.name) == null)
        ) {
            throw IOException("Invalid package transaction metadata")
        }
        if (versionId != null) {
            val before = TmlVersionCatalog(oldState)
            val after = TmlVersionCatalog(newState)
            val previousOthers = JSONObject(before.records.filterKeys { it != versionId })
            val nextOthers = JSONObject(after.records.filterKeys { it != versionId })
            if (!sameJson(previousOthers, nextOthers) || !newState.has(TmlVersionCatalog.VERSIONS))
                throw IOException("Version transaction changes unrelated versions")
            if (removing) {
                before.requireRecord(versionId)
                if (
                    after.records.containsKey(versionId) ||
                        (before.activeId != versionId && before.activeId != after.activeId)
                )
                    throw IOException("Invalid version uninstall metadata")
            } else {
                after.requireRecord(versionId)
                if (after.activeId != versionId)
                    throw IOException("Installed version must be selected")
            }
            val selected = after.activeId?.let(after::requireRecord)
            if (!sameJsonValue(selected, newState.optJSONObject(PackageKind.TMODLOADER.name)))
                throw IOException("Selected version metadata is inconsistent")
        }
        val previousOtherPackages =
            JSONObject(oldState.toString()).apply {
                remove(kind.name)
                remove("_transaction")
                if (versionId != null) {
                    remove(TmlVersionCatalog.VERSIONS)
                    remove(TmlVersionCatalog.ACTIVE)
                }
            }
        val nextOtherPackages =
            JSONObject(newState.toString()).apply {
                remove(kind.name)
                remove("_transaction")
                if (versionId != null) {
                    remove(TmlVersionCatalog.VERSIONS)
                    remove(TmlVersionCatalog.ACTIVE)
                }
            }
        if (!sameJson(previousOtherPackages, nextOtherPackages))
            throw IOException("Package transaction changes unrelated metadata")
        if (!hadStateFile && oldState.length() != 0)
            throw IOException("Package transaction has inconsistent old metadata")
        return InstallTransaction(
            json,
            id,
            kind,
            versionId,
            removing,
            phase,
            hadDestination,
            hadStateFile,
            oldState,
            newState,
        )
    }

    private fun sameJson(left: JSONObject, right: JSONObject): Boolean {
        val keys = left.keys().asSequence().toSet()
        if (keys != right.keys().asSequence().toSet()) return false
        return keys.all { key -> sameJsonValue(left.get(key), right.get(key)) }
    }

    private fun sameJsonValue(left: Any?, right: Any?): Boolean =
        when {
            left is JSONObject && right is JSONObject -> sameJson(left, right)
            left is JSONArray && right is JSONArray ->
                left.length() == right.length() &&
                    (0 until left.length()).all { sameJsonValue(left.get(it), right.get(it)) }
            else -> left == right
        }

    /** Called under installLock before any status read or subsequent import. */
    private fun recoverTransaction() {
        rejectLink(journalFile)
        if (!journalFile.exists()) return
        val transaction = parseTransaction(readJson(journalFile))
        verifyTransactionDirectories(transaction)
        val state = readStateWithoutRecovery()
        if (transaction.phase == "prepared" && state.optString("_transaction") == transaction.id) {
            val verified =
                when {
                    transaction.removing ->
                        !packageDirectory(transaction.kind, transaction.versionId).exists()
                    transaction.versionId != null ->
                        versionLayout(
                            transaction.versionId,
                            TmlVersionCatalog(state).requireRecord(transaction.versionId),
                        ) != null
                    else -> installedLayout(transaction.kind, state) != null
                }
            if (!sameJson(state, transaction.newState) || !verified) {
                throw IOException(
                    "Committed package transaction cannot be verified; recovery files retained"
                )
            }
            // A crash after the manifest rename commits the new package. Keep it and
            // finish cleanup, even if a previous cleanup removed part of the backup.
            deleteTree(File(gamesDir, ".backup-${transaction.id}"))
            deleteTree(File(gamesDir, ".import-${transaction.id}"))
            Files.delete(journalFile.toPath())
            return
        }
        if (
            !sameJson(state, transaction.oldState) || stateFile.exists() != transaction.hadStateFile
        ) {
            throw IOException("Package manifest changed during recovery; recovery files retained")
        }
        rollbackTransaction(transaction.json)
    }

    private fun verifyTransactionDirectories(transaction: InstallTransaction) {
        rejectLink(filesDir)
        rejectLink(gamesDir)
        if (!gamesDir.isDirectory) throw IOException("Package transaction storage is missing")
        for (file in
            listOf(
                packageDirectory(transaction.kind, transaction.versionId),
                File(gamesDir, ".import-${transaction.id}"),
                File(gamesDir, ".backup-${transaction.id}"),
            )) {
            rejectLink(file)
            if (file.exists() && !file.isDirectory)
                throw IOException("Package transaction path is not a directory: $file")
        }
    }

    private fun rollbackTransaction(json: JSONObject) {
        val transaction = parseTransaction(json)
        verifyTransactionDirectories(transaction)
        val destination = packageDirectory(transaction.kind, transaction.versionId)
        val staging = File(gamesDir, ".import-${transaction.id}")
        val backup = File(gamesDir, ".backup-${transaction.id}")
        // Validate the entire recovery decision before changing any file. Without an
        // old backup, a prepared replacement must still have its original staging dir.
        if (transaction.hadDestination) {
            if (
                !backup.exists() &&
                    (!destination.exists() ||
                        (transaction.phase == "prepared" && !staging.exists()))
            ) {
                throw IOException("Previous package backup is missing; recovery files retained")
            }
        } else if (backup.exists()) {
            throw IOException("Unexpected package backup; recovery files retained")
        }
        // Persist rollback intent before deleting/renaming. If recovery is interrupted
        // after backup restoration, absent backup + existing destination is then safe.
        if (transaction.phase != "rolling-back") {
            json.put("phase", "rolling-back")
            writeJsonAtomic(journalFile, json)
        }
        if (transaction.hadDestination) {
            if (backup.exists()) {
                deleteTree(destination)
                Files.move(backup.toPath(), destination.toPath())
            }
        } else {
            deleteTree(destination)
        }
        if (transaction.hadStateFile) {
            writeState(transaction.oldState)
        } else {
            rejectLink(stateFile)
            if (stateFile.exists()) {
                if (!stateFile.isFile) throw IOException("Cannot restore package manifest")
                Files.delete(stateFile.toPath())
            }
        }
        deleteTree(staging)
        Files.delete(journalFile.toPath())
    }

    private fun readJson(file: File): JSONObject {
        if (file.length() > MAX_JSON_BYTES)
            throw IOException("Package JSON is too large: ${file.name}")
        return try {
            JSONObject(file.readText())
        } catch (failure: Exception) {
            throw IOException("Invalid package JSON: ${file.name}", failure)
        }
    }

    private fun writeState(state: JSONObject) {
        writeJsonAtomic(stateFile, state)
    }

    private fun writeJsonAtomic(destination: File, state: JSONObject) {
        rejectLink(destination)
        val temporary = File(filesDir, ".package-json-${UUID.randomUUID()}.tmp")
        try {
            temporary.outputStream().use { output ->
                output.write(state.toString(2).toByteArray(Charsets.UTF_8))
                output.fd.sync()
            }
            Files.move(
                temporary.toPath(),
                destination.toPath(),
                StandardCopyOption.ATOMIC_MOVE,
                StandardCopyOption.REPLACE_EXISTING,
            )
        } finally {
            temporary.delete()
        }
    }

    private fun packageDirectory(kind: PackageKind, versionId: String? = null): File {
        versionId?.let(TmlVersionCatalog::checkId)
        return File(
            gamesDir,
            when {
                kind == PackageKind.TERRARIA -> "terraria"
                versionId == null || versionId == TmlVersionCatalog.LEGACY_ID -> "tmodloader"
                else -> "tmodloader-$versionId"
            },
        )
    }

    private fun relative(base: File, file: File) =
        base.toPath().relativize(file.toPath()).toString().replace('\\', '/')

    private fun requiredFile(root: File, name: String) =
        File(root, name).also {
            if (!it.isFile || it.length() == 0L)
                throw IOException("tModLoader package is missing $name")
        }

    private fun requireDirectory(file: File) {
        rejectLink(file)
        if (!file.isDirectory && !file.mkdirs())
            throw IOException("Cannot create package directory: $file")
    }

    private fun rejectLink(file: File) {
        if (Files.isSymbolicLink(file.toPath()))
            throw IOException("Symbolic links are unsupported in package storage: $file")
    }

    private fun deleteTree(file: File) {
        if (!Files.exists(file.toPath(), LinkOption.NOFOLLOW_LINKS)) return
        // Never follow links even if another process modified a previous installation.
        Files.walkFileTree(
            file.toPath(),
            object : SimpleFileVisitor<Path>() {
                override fun visitFile(
                    path: Path,
                    attributes: BasicFileAttributes,
                ): FileVisitResult {
                    Files.delete(path)
                    return FileVisitResult.CONTINUE
                }

                override fun postVisitDirectory(
                    path: Path,
                    failure: IOException?,
                ): FileVisitResult {
                    if (failure != null) throw failure
                    Files.delete(path)
                    return FileVisitResult.CONTINUE
                }
            },
        )
    }

    private fun checkCancelled(cancelled: () -> Boolean) {
        if (cancelled() || Thread.currentThread().isInterrupted)
            throw CancellationException("Package import cancelled")
    }

    companion object {
        private val installLock = Any()
        private const val MAX_ENTRIES = 100_000
        private const val MAX_ARCHIVE_BYTES = 8L * 1024 * 1024 * 1024
        private const val MAX_EXTRACTED_BYTES = 16L * 1024 * 1024 * 1024
        private const val MAX_FILE_BYTES = 2L * 1024 * 1024 * 1024
        private const val MAX_JSON_BYTES = 16L * 1024 * 1024
        private const val SPACE_RESERVE = 32L * 1024 * 1024
        private val WINDOWS_DEVICE = Regex("(?i)(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])")
    }
}
