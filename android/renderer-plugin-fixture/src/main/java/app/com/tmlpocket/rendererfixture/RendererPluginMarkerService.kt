package app.com.tmlpocket.rendererfixture

import android.app.Service
import android.content.Intent
import android.os.IBinder

class RendererPluginMarkerService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null
}
