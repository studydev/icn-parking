package com.studydev.icnparking.widget

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.appwidget.AppWidgetManager
import android.graphics.Bitmap
import android.graphics.Paint
import android.graphics.Typeface
import android.net.Uri
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Path as AndroidPath
import androidx.compose.runtime.remember
import androidx.compose.ui.unit.Dp
import androidx.glance.ColorFilter
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
import androidx.glance.appwidget.SizeMode
import androidx.glance.layout.Box
import androidx.glance.layout.ContentScale
import androidx.glance.text.TextAlign
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
import androidx.glance.currentState
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
import com.studydev.icnparking.core.presentation.GraphWidgetModel
import com.studydev.icnparking.core.presentation.TableWidgetModel
import com.studydev.icnparking.core.presentation.NumberText
import com.studydev.icnparking.core.presentation.ParkingSnapshot
import com.studydev.icnparking.core.presentation.SheetTarget
import com.studydev.icnparking.core.presentation.SheetTargets
import com.studydev.icnparking.core.presentation.SmallWidgetModel
import com.studydev.icnparking.core.presentation.WidgetModels
import com.studydev.icnparking.core.time.ParkingTime
import java.time.Instant
import java.util.concurrent.TimeUnit

// 위젯 3종 — Glance. 소: 주차장 한 곳 숫자 · 중: 주차장 한 곳 3시간 그래프 · 대: 터미널 묶음의 주차장별 표.
// 위젯은 앱과 같은 프로세스라 앱의 DataClient·디스크 캐시를 그대로 쓴다(iOS App Group 문제 없음).

/** 위젯마다 저장하는 설정(소·중 = 대상 id, 대 = 묶음 id "g:T1:short").
 * 구성 안에서 currentState로 읽는다: 설정을 바꾸고 update()하면 살아 있는 구성은 다시 그리기만 하고 provideGlance를 다시 부르지 않는다 */
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
        val data = WidgetData.load()
        provideContent {
            val target = currentState(WidgetConfigKey)?.let(SheetTargets::fromId) ?: DEFAULT
            Small(context, data?.let { (s, ago) -> WidgetModels.small(s, target, ago) })
        }
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

class GraphParkingWidget : GlanceAppWidget() {
    override val stateDefinition = PreferencesGlanceStateDefinition
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val data = WidgetData.load()
        provideContent {
            val target = currentState(WidgetConfigKey)?.let(SheetTargets::fromId) ?: SmallParkingWidget.DEFAULT
            Graph(context, data?.let { (s, ago) -> WidgetModels.graph(s, target, ago) })
        }
    }
}

/** 중: 주차장 한 곳의 3시간 그래프. 지금 + 30분 점 6개, 점마다 남은 대수 */
@Composable
private fun Graph(context: Context, m: GraphWidgetModel?) {
    val ink = color { it.ink }
    val base = GlanceModifier.fillMaxSize().background(color { it.widgetBg }).cornerRadius(26.dp)
    val size = LocalSize.current
    Column(m?.let { base.clickable(open(context, it.link)) } ?: base) {
        Column(GlanceModifier.fillMaxSize().then(padding)) {
            Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(m?.title ?: Strings.Widget.mediumName, style = TextStyle(color = ink, fontSize = 13.sp, fontWeight = FontWeight.Bold), maxLines = 1)
                if (m != null) Text("  " + Strings.Widget.graphSubtitle, style = TextStyle(color = color { it.muted }, fontSize = 11.sp), maxLines = 1, modifier = GlanceModifier.defaultWeight())
                else Spacer(GlanceModifier.defaultWeight())
                m?.let { Text(it.ago, style = TextStyle(color = color { p -> p.faint }, fontSize = 11.sp), maxLines = 1) }
            }
            if (m == null) {
                Spacer(GlanceModifier.defaultWeight())
                Text(Strings.Error.unavailable, style = TextStyle(color = color { it.muted }, fontSize = 12.sp))
                return@Column
            }
            Spacer(GlanceModifier.height(4.dp))
            // 그래프 영역 = 위젯 크기 − 안쪽 여백(좌우 36, 위아래 32) − 제목 줄(약 20)
            val w = (size.width - 36.dp).coerceAtLeast(120.dp)
            val h = (size.height - 32.dp - 24.dp).coerceAtLeast(60.dp)
            val layers = remember(m, w, h) { GraphBitmaps.draw(context, m.points, w, h) }
            Box(GlanceModifier.fillMaxWidth().defaultWeight()) {
                // 알파 그림을 라이트·다크 토큰 색으로 칠한다(위젯은 테마가 바뀌어도 다시 그리지 않으므로)
                listOf(layers.muted to color { it.muted }, layers.tint to color { it.tint }, layers.ink to ink).forEach { (bitmap, tintColor) ->
                    Image(ImageProvider(bitmap), contentDescription = null, colorFilter = ColorFilter.tint(tintColor), contentScale = ContentScale.FillBounds, modifier = GlanceModifier.fillMaxSize())
                }
            }
        }
    }
}

class TableParkingWidget : GlanceAppWidget() {
    override val stateDefinition = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val data = WidgetData.load()
        provideContent {
            val group = currentState(WidgetConfigKey)?.let(SheetTargets::fromId) as? SheetTarget.Group ?: DEFAULT
            Table(context, data?.let { (s, ago) -> WidgetModels.table(s, group.terminal, group.group, ago) })
        }
    }

    companion object {
        val DEFAULT = SheetTarget.Group(Terminal.T1, ZoneGroup.SHORT)
    }
}

/** 대: 묶음 전체 + 주차장별 행 × (지금 + 1·2·3시간 뒤, 배경 tint) */
@Composable
private fun Table(context: Context, m: TableWidgetModel?) {
    val ink = color { it.ink }
    val muted = color { it.muted }
    val base = GlanceModifier.fillMaxSize().background(color { it.widgetBg }).cornerRadius(26.dp)
    Column(m?.let { base.clickable(open(context, it.link)) } ?: base) {
        Column(GlanceModifier.fillMaxSize().then(padding)) {
            Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(m?.title ?: Strings.Widget.largeName, style = TextStyle(color = ink, fontSize = 14.sp, fontWeight = FontWeight.Bold), maxLines = 1)
                if (m != null) Text("  " + Strings.Widget.tableSubtitle, style = TextStyle(color = muted, fontSize = 11.sp), maxLines = 1, modifier = GlanceModifier.defaultWeight())
                else Spacer(GlanceModifier.defaultWeight())
                m?.let { Text(it.ago, style = TextStyle(color = color { p -> p.faint }, fontSize = 11.sp), maxLines = 1) }
            }
            if (m == null) {
                Spacer(GlanceModifier.defaultWeight())
                Text(Strings.Error.unavailable, style = TextStyle(color = muted, fontSize = 12.sp))
                return@Column
            }
            val header = TextStyle(color = muted, fontSize = 10.5.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center)
            Row(GlanceModifier.fillMaxWidth().padding(top = 6.dp, bottom = 2.dp)) {
                Spacer(GlanceModifier.defaultWeight())
                Text(Strings.Forecast.now, style = header, modifier = GlanceModifier.width(54.dp))
                m.times.forEach { Text(it, style = header, modifier = GlanceModifier.defaultWeight()) }
            }
            m.rows.forEach { row ->
                Row(GlanceModifier.fillMaxWidth().defaultWeight().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        row.name, maxLines = 1, modifier = GlanceModifier.defaultWeight(),
                        style = TextStyle(color = color { it.ink2 }, fontSize = 13.sp, fontWeight = if (row.isTotal) FontWeight.Bold else FontWeight.Medium),
                    )
                    Text(
                        row.available?.let { NumberText.grouped(it) } ?: row.word ?: "—", maxLines = 1, modifier = GlanceModifier.width(54.dp),
                        style = if (row.available != null) TextStyle(color = ink, fontSize = 16.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                        else TextStyle(color = muted, fontSize = 11.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center),
                    )
                    if (row.cells.isEmpty()) {
                        Box(GlanceModifier.defaultWeight().fillMaxHeight().background(color { it.chip }).cornerRadius(7.dp), contentAlignment = Alignment.Center) {
                            Text("—", style = TextStyle(color = muted, fontSize = 12.sp, fontWeight = FontWeight.Medium))
                        }
                    } else row.cells.forEachIndexed { i, c ->
                        Row(GlanceModifier.defaultWeight().fillMaxHeight()) {
                            if (i > 0) Spacer(GlanceModifier.width(5.dp))
                            Column(
                                GlanceModifier.defaultWeight().fillMaxHeight().background(tint(c.occupancy)).cornerRadius(7.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(NumberText.grouped(c.available), style = TextStyle(color = ink, fontSize = 13.sp, fontWeight = FontWeight.Bold), maxLines = 1)
                                Text(NumberText.delta(c.delta), style = TextStyle(color = deltaColor(c.delta), fontSize = 9.sp, fontWeight = FontWeight.Bold), maxLines = 1)
                            }
                        }
                    }
                }
            }
        }
    }
}

/** 위젯 그래프를 알파 비트맵 세 장(muted 시각 · tint 선과 예상 숫자 · ink 지금 점)으로 그린다 */
internal object GraphBitmaps {
    class Layers(val muted: Bitmap, val tint: Bitmap, val ink: Bitmap)

    fun draw(context: Context, points: List<GraphWidgetModel.Point>, width: Dp, height: Dp): Layers {
        // 위젯 비트맵 메모리 한도(크기별로 그려 여러 장)를 넘지 않게 배율은 최대 2, 알파만 쓰는 ALPHA_8
        val d = minOf(context.resources.displayMetrics.density, 2f)
        val w = (width.value * d).toInt().coerceAtLeast(1)
        val h = (height.value * d).toInt().coerceAtLeast(1)
        val muted = Bitmap.createBitmap(w, h, Bitmap.Config.ALPHA_8)
        val tint = Bitmap.createBitmap(w, h, Bitmap.Config.ALPHA_8)
        val ink = Bitmap.createBitmap(w, h, Bitmap.Config.ALPHA_8)
        val cm = AndroidCanvas(muted)
        val ct = AndroidCanvas(tint)
        val ci = AndroidCanvas(ink)
        fun paint(size: Float = 0f, bold: Boolean = false) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.WHITE
            textSize = size * d
            textAlign = Paint.Align.CENTER
            typeface = Typeface.create(Typeface.DEFAULT, if (bold) Typeface.BOLD else Typeface.NORMAL)
            fontFeatureSettings = "tnum"
        }
        val values = points.mapNotNull { it.available?.toDouble() }
        val lo0 = values.minOrNull()
        val hi0 = values.maxOrNull()
        val top = 16 * d
        val bottom = 16 * d
        val n = maxOf(points.size - 1, 1)
        val x = { i: Int -> 14 * d + i.toFloat() / n * (w - 28 * d) }
        // 시각(아래)
        points.forEachIndexed { i, p ->
            val label = paint(9.5f, bold = i == 0)
            (if (i == 0) ci else cm).drawText(p.label, x(i), h - 6 * d + label.textSize / 3, label)
        }
        if (lo0 == null || hi0 == null) return Layers(muted, tint, ink)
        // 변화가 보이도록 최소~최대 범위로 그린다
        val span = maxOf(hi0 - lo0, maxOf(hi0 * 0.05, 4.0))
        val lo = lo0 - span * 0.25
        val hi = hi0 + span * 0.35
        val y = { v: Double -> (top + (h - top - bottom) * (1 - (v - lo) / (hi - lo))).toFloat() }
        val line = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.WHITE; style = Paint.Style.STROKE; strokeWidth = 2.2f * d; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
        }
        val path = AndroidPath()
        var started = false
        points.forEachIndexed { i, p ->
            val a = p.available ?: run { started = false; return@forEachIndexed }
            if (started) path.lineTo(x(i), y(a.toDouble())) else { path.moveTo(x(i), y(a.toDouble())); started = true }
        }
        ct.drawPath(path, line)
        val dot = paint()
        points.forEachIndexed { i, p ->
            val a = p.available ?: return@forEachIndexed
            val now = i == 0
            val canvas = if (now) ci else ct
            val cx = x(i)
            val cy = y(a.toDouble())
            canvas.drawCircle(cx, cy, (if (now) 4f else 3f) * d, dot)
            // 숫자가 가장자리에서 잘리지 않게 안쪽으로 민다
            val text = paint(if (now) 12f else 10.5f, bold = true)
            val tw = text.measureText(NumberText.grouped(a))
            canvas.drawText(NumberText.grouped(a), cx.coerceIn(tw / 2, w - tw / 2), cy - 6 * d, text)
        }
        return Layers(muted, tint, ink)
    }
}

class SmallParkingWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = SmallParkingWidget()
    override fun onEnabled(context: Context) { super.onEnabled(context); WidgetRefresh.schedule(context) }
    override fun onDisabled(context: Context) { super.onDisabled(context); WidgetRefresh.cancelIfUnused(context) }
}

class GraphParkingWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = GraphParkingWidget()
    override fun onEnabled(context: Context) { super.onEnabled(context); WidgetRefresh.schedule(context) }
    override fun onDisabled(context: Context) { super.onDisabled(context); WidgetRefresh.cancelIfUnused(context) }
}

class TableParkingWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TableParkingWidget()
    override fun onEnabled(context: Context) { super.onEnabled(context); WidgetRefresh.schedule(context) }
    override fun onDisabled(context: Context) { super.onDisabled(context); WidgetRefresh.cancelIfUnused(context) }
}

/** 15분마다 세 위젯을 다시 그린다(WorkManager 주기 작업 최소 간격 = 15분) */
class WidgetRefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        SmallParkingWidget().updateAll(applicationContext)
        GraphParkingWidget().updateAll(applicationContext)
        TableParkingWidget().updateAll(applicationContext)
        return Result.success()
    }
}

object WidgetRefresh {
    private const val WORK = "parking-widget-refresh"
    private val RECEIVERS = listOf(SmallParkingWidgetReceiver::class.java, GraphParkingWidgetReceiver::class.java, TableParkingWidgetReceiver::class.java)

    fun schedule(context: Context) {
        val request = PeriodicWorkRequestBuilder<WidgetRefreshWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    private fun widgetCount(context: Context): Int {
        val m = AppWidgetManager.getInstance(context)
        return RECEIVERS.sumOf { m.getAppWidgetIds(ComponentName(context, it)).size }
    }

    /** 앱을 열 때: 위젯이 있으면 주기 작업을 보장(앱 업데이트 뒤에도) */
    fun scheduleIfNeeded(context: Context) { if (widgetCount(context) > 0) schedule(context) }

    fun cancelIfUnused(context: Context) { if (widgetCount(context) == 0) WorkManager.getInstance(context).cancelUniqueWork(WORK) }
}

/** 개발용: 런처에 위젯 놓기를 요청(에뮬레이터 확인용). 앱 모듈이 Glance 타입을 몰라도 되게 여기 둔다 */
object WidgetPins {
    /** kind = small | medium | large */
    fun request(context: Context, kind: String): Boolean {
        val receiver = when (kind) {
            "medium" -> GraphParkingWidgetReceiver::class.java
            "large" -> TableParkingWidgetReceiver::class.java
            else -> SmallParkingWidgetReceiver::class.java
        }
        return AppWidgetManager.getInstance(context).requestPinAppWidget(ComponentName(context, receiver), null, null)
    }
}
