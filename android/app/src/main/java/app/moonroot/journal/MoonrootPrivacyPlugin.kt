package app.moonroot.journal

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.view.WindowManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "MoonrootPrivacy")
class MoonrootPrivacyPlugin : Plugin() {

    @PluginMethod
    fun setScreenPrivacy(call: PluginCall) {
        val enabled = call.getBoolean("enabled") ?: false
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putBoolean(KEY_PIN_LOCK_ACTIVE, enabled).apply()

        val act = activity
        if (act != null) {
            act.runOnUiThread {
                if (enabled) {
                    act.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                } else {
                    act.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                }
            }
        }
        call.resolve()
    }

    @PluginMethod
    fun setDiscreetLauncher(call: PluginCall) {
        val enabled = call.getBoolean("enabled") ?: false
        val pm = context.packageManager
        val defaultAlias = ComponentName(context, "${context.packageName}.LauncherDefault")
        val discreetAlias = ComponentName(context, "${context.packageName}.LauncherDiscreet")

        val defaultState = if (enabled) {
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        } else {
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        }
        val discreetState = if (enabled) {
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        } else {
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        }

        pm.setComponentEnabledSetting(discreetAlias, discreetState, PackageManager.DONT_KILL_APP)
        pm.setComponentEnabledSetting(defaultAlias, defaultState, PackageManager.DONT_KILL_APP)
        call.resolve()
    }

    @PluginMethod
    fun isDiscreetLauncher(call: PluginCall) {
        val pm = context.packageManager
        val discreetAlias = ComponentName(context, "${context.packageName}.LauncherDiscreet")
        val enabled =
            pm.getComponentEnabledSetting(discreetAlias) == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        val ret = JSObject()
        ret.put("enabled", enabled)
        call.resolve(ret)
    }

    companion object {
        const val PREFS_NAME = "moonroot_privacy"
        const val KEY_PIN_LOCK_ACTIVE = "pin_lock_active"
    }
}
