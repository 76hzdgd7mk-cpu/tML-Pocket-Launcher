package app.com.tmlpocket.feature.stores

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

/** Only refresh tokens are retained; passwords and Guard codes are never persisted. */
internal class StoreCredentials(context: Context) {
    private val preferences =
        context.getSharedPreferences("store-credentials", Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(ALIAS, null) as? SecretKey)?.let {
            return it
        }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            .apply {
                init(
                    KeyGenParameterSpec.Builder(
                            ALIAS,
                            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                        )
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .build()
                )
            }
            .generateKey()
    }

    fun read(platform: String): JSONObject? {
        val encoded = preferences.getString(platform, null) ?: return null
        return runCatching {
                val bytes = Base64.decode(encoded, Base64.NO_WRAP)
                require(bytes.size > 28)
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(
                    Cipher.DECRYPT_MODE,
                    key(),
                    GCMParameterSpec(128, bytes.copyOfRange(0, 12)),
                )
                cipher.updateAAD(platform.toByteArray())
                JSONObject(
                    String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)
                )
            }
            .getOrElse {
                clear(platform)
                null
            }
    }

    fun save(platform: String, value: JSONObject) {
        if (read(platform)?.toString() == value.toString()) return
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        cipher.updateAAD(platform.toByteArray())
        val bytes = cipher.iv + cipher.doFinal(value.toString().toByteArray())
        check(
            preferences
                .edit()
                .putString(platform, Base64.encodeToString(bytes, Base64.NO_WRAP))
                .commit()
        ) {
            "无法保存商店登录状态"
        }
    }

    fun clear(platform: String) {
        preferences.edit().remove(platform).commit()
    }

    companion object {
        private const val ALIAS = "tml-store-refresh-tokens-v1"
    }
}
