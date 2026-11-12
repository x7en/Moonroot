package app.moonroot.journal.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.widget.RemoteViews
import app.moonroot.journal.R
import app.moonroot.journal.WidgetBridgePlugin

class MoonrootWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    companion object {
        fun updateAllWidgets(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val component = ComponentName(context, MoonrootWidgetProvider::class.java)
            val ids = manager.getAppWidgetIds(component)
            if (ids.isNotEmpty()) {
                for (id in ids) {
                    updateWidget(context, manager, id)
                }
            }
        }

        private fun updateWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val prefs = context.getSharedPreferences(
                WidgetBridgePlugin.PREFS_NAME,
                Context.MODE_PRIVATE
            )
            val stage = prefs.getInt(WidgetBridgePlugin.KEY_STAGE, 0).coerceIn(0, 6)
            val mood = prefs.getString(WidgetBridgePlugin.KEY_MOOD, "calm") ?: "calm"
            val accentRaw = prefs.getString(WidgetBridgePlugin.KEY_ACCENT, "#7ACBA5") ?: "#7ACBA5"

            val views = RemoteViews(context.packageName, R.layout.moonroot_widget)

            val imageRes = if (mood == "discreet") {
                R.drawable.ic_moonroot_leaf
            } else {
                stageDrawable(stage)
            }
            views.setImageViewResource(R.id.widget_sprout_image, imageRes)

            val parsedAccent = try {
                Color.parseColor(accentRaw)
            } catch (_: IllegalArgumentException) {
                Color.parseColor("#7ACBA5")
            }
            views.setInt(R.id.widget_accent_bar, "setBackgroundColor", parsedAccent)

            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("moonroot://checkin")).apply {
                setPackage(context.packageName)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            val pendingIntent = PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)
            views.setOnClickPendingIntent(R.id.widget_check_in_btn, pendingIntent)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        private fun stageDrawable(stage: Int): Int {
            return when (stage) {
                1 -> R.drawable.sprout_stage_1
                2 -> R.drawable.sprout_stage_2
                3 -> R.drawable.sprout_stage_3
                4 -> R.drawable.sprout_stage_4
                5 -> R.drawable.sprout_stage_5
                6 -> R.drawable.sprout_stage_6
                else -> R.drawable.sprout_stage_0
            }
        }
    }
}
