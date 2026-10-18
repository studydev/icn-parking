package com.studydev.icnparking.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.state.PreferencesGlanceStateDefinition
import com.studydev.icnparking.core.generated.Strings
import com.studydev.icnparking.core.generated.Terminal
import com.studydev.icnparking.core.generated.Tokens
import com.studydev.icnparking.core.generated.ZoneGroup
import com.studydev.icnparking.core.presentation.SheetTarget
import com.studydev.icnparking.core.presentation.SheetTargets
import com.studydev.icnparking.core.presentation.id
import com.studydev.icnparking.core.presentation.title
import kotlinx.coroutines.launch

/** 위젯을 놓을 때·길게 눌러 다시 설정할 때: 소·중 = 주차장 한 곳(T1·T2 전체·묶음·19개 주차장), 대 = 터미널 × 묶음 */
class ParkingWidgetConfigActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val appWidgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        setResult(Activity.RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return }
        val provider = AppWidgetManager.getInstance(this).getAppWidgetInfo(appWidgetId)?.provider?.className
        val large = provider == TableParkingWidgetReceiver::class.java.name
        val widget: GlanceAppWidget = when (provider) {
            TableParkingWidgetReceiver::class.java.name -> TableParkingWidget()
            GraphParkingWidgetReceiver::class.java.name -> GraphParkingWidget()
            else -> SmallParkingWidget()
        }
        val choices: List<Pair<String, String>> =
            if (large) Terminal.entries.flatMap { t -> ZoneGroup.entries.map { g -> SheetTarget.Group(t, g) } }.map { it.id to it.title }
            else SheetTargets.widgetChoices.map { it.id to it.title }

        setContent {
            val dark = isSystemInDarkTheme()
            val p = if (dark) Tokens.dark else Tokens.light
            val scope = rememberCoroutineScope()
            LazyColumn(Modifier.fillMaxSize().background(Color(p.bg.argb)).safeDrawingPadding()) {
                item {
                    Text(
                        if (large) "${Strings.Widget.terminalParameter} · ${Strings.Widget.groupParameter}" else Strings.Widget.configTitle,
                        fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color(p.ink.argb), modifier = Modifier.padding(horizontal = 20.dp, vertical = 16.dp),
                    )
                }
                items(choices, key = { it.first }) { (value, label) ->
                    Box(
                        Modifier.fillMaxWidth().height(52.dp).clickable {
                            scope.launch {
                                val glanceId = GlanceAppWidgetManager(this@ParkingWidgetConfigActivity).getGlanceIdBy(appWidgetId)
                                updateAppWidgetState(this@ParkingWidgetConfigActivity, PreferencesGlanceStateDefinition, glanceId) { prefs ->
                                    prefs.toMutablePreferences().apply { this[WidgetConfigKey] = value }
                                }
                                widget.update(this@ParkingWidgetConfigActivity, glanceId)
                                WidgetRefresh.schedule(this@ParkingWidgetConfigActivity)
                                setResult(Activity.RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
                                finish()
                            }
                        }.padding(horizontal = 20.dp),
                        contentAlignment = androidx.compose.ui.Alignment.CenterStart,
                    ) { Text(label, fontSize = 16.sp, color = Color(p.ink.argb)) }
                    HorizontalDivider(color = Color(p.line.argb))
                }
            }
        }
    }
}
