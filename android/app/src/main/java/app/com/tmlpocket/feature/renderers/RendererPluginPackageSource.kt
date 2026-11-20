package app.com.tmlpocket.feature.renderers

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import java.io.InputStream

data class InstalledRendererPackage(
    val packageName: String,
    val versionName: String?,
    val versionCode: Long,
    val openAsset: (String) -> InputStream,
)

interface RendererPluginPackageSource {
    fun queryInstalled(): List<InstalledRendererPackage>
}

class AndroidRendererPluginPackageSource(private val context: Context) : RendererPluginPackageSource {
    override fun queryInstalled(): List<InstalledRendererPackage> {
        val intent = Intent(ACTION_RENDERER_PLUGIN)
        val services = context.packageManager.queryIntentServices(intent, 0)
        return services.mapNotNull { resolveInfo ->
            val packageName = resolveInfo.serviceInfo?.packageName ?: return@mapNotNull null
            runCatching {
                val info = if (Build.VERSION.SDK_INT >= 33) {
                    context.packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
                } else {
                    @Suppress("DEPRECATION")
                    context.packageManager.getPackageInfo(packageName, 0)
                }
                val packageContext = context.createPackageContext(packageName, 0)
                InstalledRendererPackage(packageName, info.versionName, info.longVersionCode) { path ->
                    packageContext.assets.open(path.removePrefix("assets/"))
                }
            }.getOrNull()
        }.distinctBy { it.packageName }
    }

    companion object {
        const val ACTION_RENDERER_PLUGIN = "dev.tml.mobilelauncher.action.RENDERER_PLUGIN"
        const val DESCRIPTOR_ASSET = "assets/tml-renderer/manifest.json"
    }
}
