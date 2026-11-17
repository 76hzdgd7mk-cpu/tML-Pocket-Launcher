package dev.tml.mobilelauncher.feature.stores

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import java.io.ByteArrayOutputStream

/** Send a bounded raster image to the local WebView; remote HTML never loads there. */
internal object SteamArtwork {
    fun encode(bytes: ByteArray): String {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        require(
            bounds.outWidth in 1..4096 &&
                bounds.outHeight in 1..4096 &&
                bounds.outWidth.toLong() * bounds.outHeight <= 8_000_000
        )
        val options =
            BitmapFactory.Options().apply {
                inSampleSize = 1
                while (
                    bounds.outWidth / inSampleSize > 960 || bounds.outHeight / inSampleSize > 640
                ) inSampleSize *= 2
            }
        val bitmap = requireNotNull(BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options))
        try {
            val output = ByteArrayOutputStream()
            for (quality in listOf(85, 65, 45)) {
                output.reset()
                check(bitmap.compress(Bitmap.CompressFormat.JPEG, quality, output))
                if (output.size() <= 120_000)
                    return "data:image/jpeg;base64," +
                        Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
            }
            error("Steam 封面过大")
        } finally {
            bitmap.recycle()
        }
    }
}
