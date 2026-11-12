package app.moonroot.journal

import android.content.Context
import android.os.Bundle
import android.view.WindowManager
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(WidgetBridgePlugin::class.java)
        registerPlugin(MoonrootPrivacyPlugin::class.java)
        super.onCreate(savedInstanceState)
        applySavedScreenPrivacy()
    }

    override fun onResume() {
        super.onResume()
        applySavedScreenPrivacy()
    }

    private fun applySavedScreenPrivacy() {
        val prefs = getSharedPreferences(MoonrootPrivacyPlugin.PREFS_NAME, Context.MODE_PRIVATE)
        val pinLocked = prefs.getBoolean(MoonrootPrivacyPlugin.KEY_PIN_LOCK_ACTIVE, false)
        if (pinLocked) {
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }
}
