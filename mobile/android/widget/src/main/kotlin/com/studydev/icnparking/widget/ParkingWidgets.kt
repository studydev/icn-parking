package com.studydev.icnparking.widget

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.appwidget.AppWidgetManager
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.glance.appwidget.updateAll
import com.studydev.icnparking.core.ParkingServices
import com.studydev.icnparking.core.forecast.Freshness
import com.studydev.icnparking.core.generated.OccupancyBand
import com.studydev.icnparking.core.generated.Strings
import com.studydev.icnparking.core.generated.Terminal
import com.studydev.icnparking.core.generated.ThemeMode
import com.studydev.icnparking.core.generated.TokenColor
import com.studydev.icnparking.core.generated.ThemePalette
import com.studydev.icnparking.core.generated.Tokens
import com.studydev.icnparking.core.generated.ZoneGroup
import com.studydev.icnparking.core.presentation.DeepLink
import com.studydev.icnparking.core.presentation.MediumWidgetModel
import com.studydev.icnparking.core.presentation.NumberText
import com.studydev.icnparking.core.presentation.ParkingSnapshot
import com.studydev.icnparking.core.presentation.SheetTarget
import com.studydev.icnparking.core.presentation.SheetTargets
import com.studydev.icnparking.core.presentation.SmallWidgetModel
import com.studydev.icnparking.core.presentation.WidgetModels
import com.studydev.icnparking.core.time.ParkingTime
import java.time.Instant
import java.util.concurrent.TimeUnit

// 위젯(디자인 5m) — Glance. 위젯은 앱과 같은 프로세스라 앱의 DataClient·디스크 캐시를 그대로 쓴다(iOS App Group 문제 없음).

/** 위젯마다 저장하는 설정(소 = 대상 id, 중 = 터미널 코드) */
internal val WidgetConfigKey = stringPreferencesKey("config")

private fun Color(t: TokenColor) = androidx.compose.ui.graphics.Color(t.argb)

/** 라이트·다크 토큰 한 쌍 */
private fun color(pick: (ThemePalette) -> TokenColor): ColorProvider = ColorProvider(day = Color(pick(Tokens.light)), night = Color(pick(Tokens.dark)))

private fun tint(o: Double): ColorProvider = ColorProvider(Color(OccupancyBand.of(o).tint(ThemeMode.LIGHT)), Color(OccupancyBand.of(o).tint(ThemeMode.DARK)))

private fun deltaColor(d: Int): ColorProvider = when {
    d > 0 -> color { it.up }
    d < 0 -> color { it.down }
    else -> color { it.muted }
}

private fun open(context: Context, link: DeepLink) =
    actionStartActivity(Intent(Intent.ACTION_VIEW, Uri.parse(link.url)).setPackage(context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))

/** 위젯용 데이터: 앱과 같은 캐시. latest + 예측에 필요한 날짜 파일 */
internal object WidgetData {
    suspend fun load(): Pair<ParkingSnapshot, Int>? {
        val client = runCatching { ParkingServices.get().client }.getOrNull() ?: return null
        val latest = runCatching { client.latest() }.getOrNull() ?: return null
        val now = Instant.now()
        val kst = ParkingTime.kst(now)
        val days = client.days(ParkingSnapshot.forecastDates(kst.date))
        val minutes = when (val f = Freshness.of(latest.value.slot, false, now, false)) {
            is Freshness.Normal -> f.minutes
            is Freshness.Delayed -> f.minutes
            is Freshness.Offline -> 0
        }
        return ParkingSnapshot(latest.value, days, now = kst.slotTime) to minutes
    }
}

private val padding = GlanceModifier.padding(horizontal = 18.dp, vertical = 16.dp)

class SmallParkingWidget : GlanceAppWidget() {
    override val stateDefinition = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val prefs = getAppWidgetState(context, PreferencesGlanceStateDefinition, id)
        val target = prefs[WidgetConfigKey]?.let(SheetTargets::fromId) ?: DEFAULT
        val model = WidgetData.load()?.let { (s, ago) -> WidgetModels.small(s, target, ago) }
        provideContent { Small(context, model) }
    }

    companion object {
        val DEFAULT: SheetTarget = SheetTarget.Group(Terminal.T1, ZoneGroup.SHORT)
    }
}

@Composable
private fun Small(context: Context, m: SmallWidgetModel?) {
    val ink = color { it.ink }
    val base = GlanceModifier.fillMaxSize().background(color { it.widgetBg }).cornerRadius(26.dp)
    Column(m?.let { base.clickable(open(context, it.link)) } ?: base) {
        Column(GlanceModifier.fillMaxSize().then(padding)) {
            Text(m?.title ?: Strings.Widget.smallName, style = TextStyle(color = ink, fontSize = 13.sp, fontWeight = FontWeight.Bold), maxLines = 1)
            Spacer(GlanceModifier.defaultWeight())
            if (m == null) {
                Text(Strings.Error.unavailable, style = TextStyle(color = color { it.muted }, fontSize = 12.sp))
                return@Column
            }
            if (m.available != null && (m.word == null || m.word == Strings.Zone.full)) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(NumberText.grouped(m.available!!), style = TextStyle(color = ink, fontSize = 34.sp, fontWeight = FontWeight.Bold))
                    Text(Strings.Unit.cars, style = TextStyle(color = ink, fontSize = 14.sp, fontWeight = FontWeight.Medium), modifier = GlanceModifier.padding(bottom = 5.dp))
                }
            } else {
                Text(m.word ?: Strings.Zone.missing, style = TextStyle(color = color { it.muted }, fontSize = 24.sp, fontWeight = FontWeight.Bold))
            }
            val o = m.occupancy ?: 0.0
            LinearProgressIndicator(
                progress = o.toFloat(),
                modifier = GlanceModifier.fillMaxWidth().height(5.dp).cornerRadius(3.dp),
                color = ColorProvider(Color(OccupancyBand.of(o).color), Color(OccupancyBand.of(o).color)),
                backgroundColor = color { it.track },
            )
            Spacer(GlanceModifier.height(8.dp))
            m.deltaHour?.let { d ->
                Row {
                    Text(Strings.Widget.inOneHourPrefix + " ", style = TextStyle(color = ink, fontSize = 12.5.sp, fontWeight = FontWeight.Medium))
                    Text(NumberText.delta(d) + Strings.Unit.cars, style = TextStyle(color = deltaColor(d), fontSize = 12.5.sp, fontWeight = FontWeight.Medium))
                }
            }
            Text(m.ago, style = TextStyle(color = color { it.faint }, fontSize = 11.sp), modifier = GlanceModifier.padding(top = 2.dp))
        }
    }
}

class MediumParkingWidget : GlanceAppWidget() {
    override val stateDefinition = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val prefs = getAppWidgetState(context, PreferencesGlanceStateDefinition, id)
        val terminal = prefs[WidgetConfigKey]?.let(Terminal::fromCode) ?: Terminal.T1
        val model = WidgetData.load()?.let { (s, ago) -> WidgetModels.medium(s, terminal, ago) }
        provideContent { Medium(context, model) }
    }
}

@Composable
private fun Medium(context: Context, m: MediumWidgetModel?) {
    val ink = color { it.ink }
    val base = GlanceModifier.fillMaxSize().background(color { it.widgetBg }).cornerRadius(26.dp)
    Column(m?.let { base.clickable(open(context, it.link)) } ?: base) {
        Column(GlanceModifier.fillMaxSize().then(padding)) {
            Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(m?.title ?: Strings.Widget.mediumName, style = TextStyle(color = ink, fontSize = 13.sp, fontWeight = FontWeight.Bold), maxLines = 1, modifier = GlanceModifier.defaultWeight())
                m?.let { Text(it.ago, style = TextStyle(color = color { p -> p.faint }, fontSize = 11.sp)) }
            }
            if (m == null) {
                Spacer(GlanceModifier.defaultWeight())
                Text(Strings.Error.unavailable, style = TextStyle(color = color { it.muted }, fontSize = 12.sp))
                return@Column
            }
            m.rows.forEach { row ->
                Spacer(GlanceModifier.height(8.dp))
                Row(GlanceModifier.fillMaxWidth().defaultWeight(), verticalAlignment = Alignment.CenterVertically) {
                    Column(GlanceModifier.width(92.dp)) {
                        Text(row.name, style = TextStyle(color = color { it.muted }, fontSize = 12.sp), maxLines = 1)
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text(row.available?.let { NumberText.grouped(it) } ?: "—", style = TextStyle(color = ink, fontSize = 20.sp, fontWeight = FontWeight.Bold), maxLines = 1)
                            Text(Strings.Unit.cars, style = TextStyle(color = ink, fontSize = 12.sp, fontWeight = FontWeight.Medium), modifier = GlanceModifier.padding(bottom = 3.dp))
                        }
                    }
                    row.cells.forEachIndexed { i, c ->
                        if (i > 0) Spacer(GlanceModifier.width(5.dp))
                        Column(
                            GlanceModifier.defaultWeight().fillMaxHeight().background(tint(c.occupancy)).cornerRadius(7.dp).padding(vertical = 4.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(c.time, style = TextStyle(color = color { it.ink2 }, fontSize = 9.5.sp), maxLines = 1)
                            Text(NumberText.grouped(c.available), style = TextStyle(color = ink, fontSize = 14.sp, fontWeight = FontWeight.Bold), maxLines = 1)
                            Text(NumberText.delta(c.delta), style = TextStyle(color = deltaColor(c.delta), fontSize = 9.5.sp, fontWeight = FontWeight.Bold), maxLines = 1)
                        }
                    }
                }
            }
        }
    }
}

class SmallParkingWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = SmallParkingWidget()
    override fun onEnabled(context: Context) { super.onEnabled(context); WidgetRefresh.schedule(context) }
    override fun onDisabled(context: Context) { super.onDisabled(context); WidgetRefresh.cancelIfUnused(context) }
}

class MediumParkingWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = MediumParkingWidget()
    override fun onEnabled(context: Context) { super.onEnabled(context); WidgetRefresh.schedule(context) }
    override fun onDisabled(context: Context) { super.onDisabled(context); WidgetRefresh.cancelIfUnused(context) }
}

/** 15분마다 두 위젯을 다시 그린다(WorkManager 주기 작업 최소 간격 = 15분) */
class WidgetRefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        SmallParkingWidget().updateAll(applicationContext)
        MediumParkingWidget().updateAll(applicationContext)
        return Result.success()
    }
}

object WidgetRefresh {
    private const val WORK = "parking-widget-refresh"

    fun schedule(context: Context) {
        val request = PeriodicWorkRequestBuilder<WidgetRefreshWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    private fun widgetCount(context: Context): Int {
        val m = AppWidgetManager.getInstance(context)
        return listOf(SmallParkingWidgetReceiver::class.java, MediumParkingWidgetReceiver::class.java).sumOf { m.getAppWidgetIds(ComponentName(context, it)).size }
    }

    /** 앱을 열 때: 위젯이 있으면 주기 작업을 보장(앱 업데이트 뒤에도) */
    fun scheduleIfNeeded(context: Context) { if (widgetCount(context) > 0) schedule(context) }

    fun cancelIfUnused(context: Context) { if (widgetCount(context) == 0) WorkManager.getInstance(context).cancelUniqueWork(WORK) }
}

/** 개발용: 런처에 위젯 놓기를 요청(에뮬레이터 확인용). 앱 모듈이 Glance 타입을 몰라도 되게 여기 둔다 */
object WidgetPins {
    fun request(context: Context, medium: Boolean): Boolean {
        val receiver = if (medium) MediumParkingWidgetReceiver::class.java else SmallParkingWidgetReceiver::class.java
        return AppWidgetManager.getInstance(context).requestPinAppWidget(ComponentName(context, receiver), null, null)
    }
}
