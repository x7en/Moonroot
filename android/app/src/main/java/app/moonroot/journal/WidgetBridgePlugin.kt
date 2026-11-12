package app.moonroot.journal

import android.content.Context
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import app.moonroot.journal.widget.MoonrootWidgetProvider

@CapacitorPlugin(name = "WidgetBridge")
class WidgetBridgePlugin : Plugin() {

    @PluginMethod
    fun setState(call: PluginCall) {
        val stage = (call.getInt("stage") ?: 0).coerceIn(0, 6)
        val mood = call.getString("mood") ?: "calm"
        val accent = call.getString("accent") ?: "#700143"

        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putInt(KEY_STAGE, stage)
            .putString(KEY_MOOD, mood)
            .putString(KEY_ACCENT, accent)
            .apply()

        MoonrootWidgetProvider.updateAllWidgets(context)
        call.resolve()
    }

    companion object {
        const val PREFS_NAME = "moonroot_widget"
        const val KEY_STAGE = "stage"
        const val KEY_MOOD = "mood"
        const val KEY_ACCENT = "accent"
    }
}
