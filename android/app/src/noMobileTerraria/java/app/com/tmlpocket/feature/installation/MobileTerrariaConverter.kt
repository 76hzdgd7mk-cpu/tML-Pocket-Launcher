package app.com.tmlpocket.feature.installation

import android.content.Context
import java.io.File
import org.json.JSONObject

internal object MobileTerrariaConverter {
    @Suppress("UNUSED_PARAMETER")
    fun prepareControlArt(context: Context, terrariaRoot: File): File? = null

    @Suppress("UNUSED_PARAMETER")
    fun convertInstalled(context: Context, destination: File, progress: MobileTerrariaPackage.Progress): JSONObject =
        error("此 APK 未包含 Terraria PE 转换器")
}
