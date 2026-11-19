package dev.tml.mobilelauncher.feature.game

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import android.os.Process
import android.util.AtomicFile
import android.util.Log
import java.io.File
import java.io.RandomAccessFile
import java.util.UUID
import org.json.JSONObject

/** The launcher reads this journal after :game dies; no fatal-signal handler is replaced. */
internal object GameCrashReports {
    private const val TAG = "MobileLauncher"
    private const val LIMIT = 512 * 1024
    private var capture: java.lang.Process? = null
    private var capturedSession: String? = null

    data class Report(val session: String, val text: String)

    private fun root(context: Context) = File(context.filesDir, "userdata/Logs/game-crashes")
    private fun directory(context: Context, session: String): File {
        require(session.matches(Regex("[a-f0-9-]{36}")))
        return File(root(context), session)
    }

    private fun write(file: File, text: String) {
        file.parentFile?.mkdirs()
        val atomic = AtomicFile(file)
        val stream = atomic.startWrite()
        try {
            stream.write(text.toByteArray(Charsets.UTF_8))
            atomic.finishWrite(stream)
        } catch (failure: Throwable) {
            atomic.failWrite(stream)
            throw failure
        }
    }

    private fun read(file: File): String = runCatching {
        AtomicFile(file).openRead().bufferedReader().use { it.readText() }
    }.getOrDefault("")

    fun begin(context: Context, version: String, renderer: String): String {
        stopCapture()
        val session = UUID.randomUUID().toString()
        val folder = directory(context, session).apply { mkdirs() }
        write(File(folder, "session.json"), JSONObject()
            .put("started", System.currentTimeMillis()).put("version", version)
            .put("renderer", renderer).toString())
        write(File(root(context), "current"), session)
        // Bound retained data. Never touch game worlds, players or other log directories.
        root(context).listFiles()?.filter { it.isDirectory && it.name != session }
            ?.sortedByDescending { it.lastModified() }?.drop(4)?.forEach { it.deleteRecursively() }
        startCapture(context, session, folder)
        return session
    }

    private fun startCapture(context: Context, session: String, folder: File) {
        runCatching {
            val process = ProcessBuilder("logcat", "-b", "main", "-b", "crash", "-v", "threadtime",
                "--uid=${context.applicationInfo.uid}", "-T", "1")
                .redirectErrorStream(true).start()
            capture = process
            capturedSession = session
            Thread({
                try {
                    process.inputStream.bufferedReader().use { input ->
                        var file = File(folder, "logcat.log")
                        var output = file.outputStream()
                        var size = 0
                        try {
                            input.forEachLine { line ->
                                val bytes = (line.take(16000) + "\n").toByteArray(Charsets.UTF_8)
                                if (size + bytes.size > LIMIT) {
                                    output.close()
                                    val previous = File(folder, "logcat-previous.log")
                                    previous.delete()
                                    check(file.renameTo(previous))
                                    output = file.outputStream()
                                    size = 0
                                }
                                output.write(bytes)
                                output.flush()
                                size += bytes.size
                            }
                        } finally { output.close() }
                    }
                } catch (failure: Exception) {
                    Log.w(TAG, "Game log capture ended: ${failure.javaClass.simpleName}")
                }
            }, "GameLogCapture").apply { isDaemon = true; start() }
        }.onFailure { Log.w(TAG, "Game log capture unavailable", it) }
    }

    private fun stopCapture() {
        capture?.destroy()
        capture = null
        capturedSession = null
    }

    fun started(context: Context, session: String) {
        write(File(directory(context, session), "process.json"), JSONObject()
            .put("pid", Process.myPid()).put("started", System.currentTimeMillis()).toString())
        stage(context, session, "正在加载 SDL、FNA3D 和原生运行库")
    }

    fun stage(context: Context, session: String, detail: String) {
        runCatching { write(File(directory(context, session), "stage"), detail.take(2000)) }
    }

    fun firstFrame(context: Context, session: String) {
        runCatching { write(File(directory(context, session), "first-frame"), "presented") }
    }

    fun failed(context: Context, session: String, failure: Throwable) {
        runCatching {
            write(File(directory(context, session), "exception.log"), failure.stackTraceToString().take(64000))
        }.onFailure { Log.e(TAG, "Could not save game exception", it) }
    }

    fun normalExit(context: Context, session: String) {
        runCatching { write(File(directory(context, session), "normal-exit"), "returned") }
    }

    fun handled(context: Context, session: String) {
        write(File(directory(context, session), "handled"), "shown")
    }

    /** Called on a launcher worker, including after the launcher itself was recreated. */
    fun collect(context: Context): Report? {
        val session = read(File(root(context), "current")).trim()
        if (session.isBlank()) return null
        val folder = directory(context, session)
        if (File(folder, "handled").exists()) return null
        val metadata = JSONObject(read(File(folder, "session.json")))
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        if (manager.runningAppProcesses?.any { it.processName == "${context.packageName}:game" } == true)
            return null
        // Give ActivityManager time to publish exit info and avoid racing a new Activity launch.
        if (System.currentTimeMillis() - metadata.getLong("started") < 3000) return null
        val process = read(File(folder, "process.json")).takeIf { it.isNotBlank() }?.let(::JSONObject)
        val pid = process?.optInt("pid") ?: 0
        val exit = if (Build.VERSION.SDK_INT >= 30) runCatching {
            manager.getHistoricalProcessExitReasons(context.packageName, pid, 16).firstOrNull {
                it.processName == "${context.packageName}:game" &&
                    it.timestamp >= metadata.getLong("started") && (pid == 0 || it.pid == pid)
            }
        }.onFailure { Log.w(TAG, "System exit history unavailable", it) }.getOrNull() else null
        val exception = read(File(folder, "exception.log"))
        val systemCrash = Build.VERSION.SDK_INT >= 30 && exit != null &&
            (exit.reason in setOf(ApplicationExitInfo.REASON_CRASH,
                ApplicationExitInfo.REASON_CRASH_NATIVE, ApplicationExitInfo.REASON_ANR) ||
                (exit.reason == ApplicationExitInfo.REASON_SIGNALED && exit.status != 9))
        if (exception.isBlank() && !systemCrash &&
            (File(folder, "normal-exit").exists() ||
                (Build.VERSION.SDK_INT >= 30 && exit?.reason == ApplicationExitInfo.REASON_USER_REQUESTED))) {
            handled(context, session)
            if (capturedSession == session) stopCapture()
            return null
        }
        val summary = buildString {
            appendLine(if (File(folder, "first-frame").exists()) "游戏进程异常退出" else "游戏启动失败：进程在首帧前退出")
            appendLine("tML: ${metadata.optString("version")}；渲染器: ${metadata.optString("renderer")}")
            appendLine("PID: $pid；时间: ${java.util.Date(metadata.getLong("started"))}")
            appendLine("最后阶段: ${read(File(folder, "stage")).ifBlank { "正在创建游戏进程" }}")
            if (Build.VERSION.SDK_INT >= 30 && exit != null) {
                val reason = when (exit.reason) {
                    ApplicationExitInfo.REASON_CRASH_NATIVE -> "Native 崩溃（C/C++）"
                    ApplicationExitInfo.REASON_CRASH -> "Java 未捕获异常"
                    ApplicationExitInfo.REASON_SIGNALED -> "被信号终止"
                    ApplicationExitInfo.REASON_LOW_MEMORY -> "系统内存不足"
                    ApplicationExitInfo.REASON_ANR -> "游戏无响应（ANR）"
                    ApplicationExitInfo.REASON_EXIT_SELF -> "进程自行退出"
                    else -> "系统退出原因 ${exit.reason}"
                }
                appendLine("$reason；状态/信号: ${exit.status}")
                if (exit.reason in setOf(ApplicationExitInfo.REASON_SIGNALED, ApplicationExitInfo.REASON_CRASH_NATIVE)) {
                    val signal = when (exit.status) {
                        4 -> "SIGILL"
                        6 -> "SIGABRT"
                        7 -> "SIGBUS"
                        8 -> "SIGFPE"
                        9 -> "SIGKILL"
                        11 -> "SIGSEGV"
                        else -> "signal ${exit.status}"
                    }
                    appendLine("信号: $signal")
                }
                appendLine(exit.description.orEmpty())
                runCatching {
                    val trace = File(folder, "system-exit-trace.bin")
                    val input = exit.traceInputStream
                    if (input == null) appendLine("系统没有提供崩溃 trace；以下保留进程日志。")
                    input?.use {
                        trace.outputStream().use { output ->
                            val buffer = ByteArray(8192)
                            var remaining = 4 * 1024 * 1024
                            while (remaining > 0) {
                                val count = input.read(buffer, 0, minOf(buffer.size, remaining))
                                if (count < 0) break
                                output.write(buffer, 0, count)
                                remaining -= count
                            }
                            if (remaining == 0) appendLine("系统 trace 达到 4 MiB 保存上限，文件可能被截断。")
                        }
                        appendLine("系统崩溃 trace 已保存为 system-exit-trace.bin。")
                        if (exit.reason == ApplicationExitInfo.REASON_CRASH_NATIVE)
                            appendLine(NativeTombstone.describe(trace.readBytes()))
                        else appendLine(tail(trace, 16000))
                    }
                }.onFailure { appendLine("系统未允许读取崩溃 trace: ${it.javaClass.simpleName}") }
            } else {
                appendLine("系统未提供退出记录；无法确定是 native 崩溃、强制结束还是内存回收。")
            }
            if (exception.isNotBlank()) appendLine("\n$exception")
            appendLine("\n--- 游戏进程 logcat 尾部 ---")
            appendLine(tail(File(folder, "logcat-previous.log"), 8000))
            appendLine(tail(File(folder, "logcat.log"), 24000))
            appendLine("\n报告目录: ${folder.absolutePath}")
            appendLine("SIGKILL 无法生成进程内堆栈；系统未提供的 tombstone 无法由普通应用读取。")
        }
        write(File(folder, "report.log"), summary)
        if (capturedSession == session) stopCapture()
        Log.e(TAG, "Game process exited unexpectedly; pid=$pid; report=${folder.absolutePath}")
        return Report(session, summary)
    }

    private fun tail(file: File, limit: Int): String = runCatching {
        RandomAccessFile(file, "r").use { input ->
            input.seek(maxOf(0L, input.length() - limit))
            ByteArray((input.length() - input.filePointer).toInt()).also(input::readFully)
                .toString(Charsets.UTF_8)
        }
    }.getOrDefault("")
}
