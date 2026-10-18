package com.studydev.icnparking

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import com.studydev.icnparking.core.generated.Strings
import com.studydev.icnparking.core.generated.Terminal
import com.studydev.icnparking.core.generated.Tokens
import com.studydev.icnparking.core.generated.ZoneGroup
import com.studydev.icnparking.core.generated.Zones
import com.studydev.icnparking.core.presentation.HistoryModel
import com.studydev.icnparking.core.presentation.NumberText
import com.studydev.icnparking.core.presentation.ids
import com.studydev.icnparking.core.settings.DisplayUnit
import com.studydev.icnparking.core.time.LocalDates
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.roundToInt

/** 히스토리(디자인 5p/5q): 기간·그룹 → 구역 칩 → 그래프 → 요약 → 일별 표 */
@Composable
fun HistoryScreen(state: AppViewModel.UiState, model: AppViewModel) {
    val theme = LocalTheme.current
    LaunchedEffect(Unit) { model.loadHistory() }
    val ids = historyZoneIds(state.terminal, state.historyGroup)
    val h = remember(state.days, state.now, ids, state.historyDays, state.latest) {
        state.snapshot?.let { HistoryModel(it.days, ids, it.now, state.historyDays, it.holidays) }
    } ?: return
    val focus = h.lines.firstOrNull { it.id == state.historyFocus } ?: h.lines.first()
    val colors = historyColors(ids, theme)
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 12.dp)) {
        Row(Modifier.fillMaxWidth().padding(top = 2.dp, bottom = 10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Segmented(listOf(7, 14, 30).map { it to Strings.History.days(it.toString()) }, state.historyDays, model::setHistoryDays)
            Segmented(listOf(ZoneGroup.SHORT to Strings.History.groupShort, ZoneGroup.LONG to Strings.History.groupLong, ZoneGroup.RESERVED to Strings.History.groupReserved), state.historyGroup, model::setHistoryGroup)
        }
        if (h.lines.size > 1) {
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                h.lines.forEach { line ->
                    val on = line.id == focus.id
                    Box(
                        Modifier.height(30.dp).clip(RoundedCornerShape(15.dp)).background(if (on) theme.p.ink.toColor() else theme.p.chip.toColor()).clickable { model.setHistoryFocus(line.id) }.padding(horizontal = 12.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                            Box(Modifier.size(8.dp).clip(CircleShape).background(colors.getValue(line.id)))
                            Text(historyName(line.id), style = style(12.5f, FontWeight.Bold, if (on) theme.p.bg.toColor() else theme.p.ink2.toColor()))
                        }
                    }
                }
            }
        }
        val st = focus.stats
        val name = historyName(focus.id)
        val summary = when {
            st == null -> if (state.loadingHistory) Strings.Meta.loading else Strings.History.noData
            state.unit == DisplayUnit.OCCUPANCY -> Strings.History.summaryOccupancy(name, NumberText.percent(st.averageOccupancy), NumberText.percent(st.maxOccupancy), st.fullHours.toString())
            else -> Strings.History.summaryAvailable(name, NumberText.grouped(st.averageAvailable), NumberText.grouped(st.minAvailable), st.fullHours.toString())
        }
        HistoryChart(h, focus.id, state.unit, state.historyDays, summary, colors)
        Text(
            summary,
            style = style(12.5f, FontWeight.SemiBold, theme.p.ink2.toColor(), tabular = true),
            modifier = Modifier.padding(start = 2.dp, end = 2.dp, top = 6.dp),
        )
        HeatTable(h, focus.id, state.unit, colors, model::setHistoryFocus)
    }
}

fun historyZoneIds(t: Terminal, g: ZoneGroup): List<String> = Zones.layout(t).ids(g)

/** 구역별 선 색(토큰 series, 그룹 구역 순서). 그룹 전체 = ink */
fun historyColors(ids: List<String>, theme: Theme): Map<String, Color> =
    mapOf(HistoryModel.ALL_ID to theme.p.ink.toColor()) + ids.mapIndexed { i, id -> id to Tokens.series[i % Tokens.series.size].color(theme.mode).toColor() }

fun historyName(id: String): String = if (id == HistoryModel.ALL_ID) Strings.History.all else Zones.byId[id]?.shortName ?: id

private data class Segment(val date: String, val a: Int, val b: Int, val red: Boolean)

private fun segments(h: HistoryModel): List<Segment> {
    val red = h.dates.associate { it.date to it.red }
    val out = mutableListOf<Segment>()
    var start = 0
    for (k in 1..h.points.size) {
        if (k == h.points.size || h.points[k].date != h.points[start].date) {
            val d = h.points[start].date
            val w = LocalDates.weekday(d)
            out += Segment(d, start, minOf(k, h.points.size - 1), red[d] ?: (w == 0 || w == 6))
            start = k
        }
    }
    return out
}

private fun nice(v: Double): Double {
    val p = 10.0.pow(floor(log10(max(v, 1.0))))
    return ceil(v / p) * p
}

/** 디자인 좌표(334×184, 플롯 x 30~330 · y 8~176)를 폭에 맞춰 그린다 */
@Composable
private fun HistoryChart(h: HistoryModel, focusId: String, unit: DisplayUnit, nDays: Int, label: String, colors: Map<String, Color>) {
    val theme = LocalTheme.current
    val occ = unit == DisplayUnit.OCCUPANCY
    val n = h.points.size - 1
    val ymax = if (occ) 100.0 else nice(h.lines.flatMap { l -> l.values.mapNotNull { it?.available } }.maxOrNull() ?: 1.0)
    val segs = remember(h) { segments(h) }
    val step = if (nDays >= 30) 2 else 1
    BoxWithConstraints(Modifier.fillMaxWidth().semantics { contentDescription = label }) {
        val sx = maxWidth.value / 334f
        val chartHeight = maxWidth.value * 184f / 334f
        Column {
            Box(Modifier.fillMaxWidth().aspectRatio(334f / 184f)) {
                val wk = theme.p.wk.toColor()
                val band = theme.p.band.toColor()
                val line = theme.p.line.toColor()
                val up = theme.p.up.toColor()
                val faint = theme.p.faint.toColor()
                val ink = theme.p.ink.toColor()
                Canvas(Modifier.fillMaxSize()) {
                    val k = size.width / 334f
                    val ky = size.height / 184f
                    val x = { i: Int -> (30f + 300f * i / n) * k }
                    val y = { v: Double -> (176f - 168f * (v / ymax).toFloat()) * ky }
                    segs.forEachIndexed { i, s ->
                        if (s.red || i % 2 == 1) drawRect(if (s.red) wk else band, Offset(x(s.a), 8f * ky), Size(x(s.b) - x(s.a), 168f * ky))
                    }
                    listOf(0.0, 0.5, 1.0).forEach { f -> drawLine(line, Offset(30f * k, y(ymax * f)), Offset(330f * k, y(ymax * f)), 1.dp.toPx()) }
                    if (occ) drawLine(up, Offset(30f * k, y(98.0)), Offset(330f * k, y(98.0)), 1.2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx())))
                    fun path(l: HistoryModel.Line): Path = Path().apply {
                        var drawing = false
                        l.values.forEachIndexed { i, v ->
                            if (i % step != 0 && i != n) return@forEachIndexed
                            if (v == null) { drawing = false; return@forEachIndexed }
                            val px = x(i)
                            val py = y(if (occ) v.occupancy * 100 else v.available)
                            if (drawing) lineTo(px, py) else { moveTo(px, py); drawing = true }
                        }
                    }
                    // 강조 선은 굵게, 나머지는 같은 색으로 가늘고 옅게(전체 강조일 때는 구역 선을 또렷하게)
                    val allFocused = focusId == HistoryModel.ALL_ID
                    h.lines.filter { it.id != focusId }.forEach {
                        drawPath(path(it), (colors[it.id] ?: faint).copy(alpha = if (allFocused) 0.85f else 0.4f), style = Stroke(1.3.dp.toPx(), join = StrokeJoin.Round))
                    }
                    h.lines.firstOrNull { it.id == focusId }?.let { drawPath(path(it), colors[it.id] ?: ink, style = Stroke(2.6.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)) }
                    drawLine(ink, Offset(330f * k, 8f * ky), Offset(330f * k, 176f * ky), 1.2.dp.toPx())
                }
                listOf(0.0, 0.5, 1.0).forEach { f ->
                    val yDp = (176f - 168f * f.toFloat()) * chartHeight / 184f
                    Text(
                        if (occ) "${(100 * f).roundToInt()}%" else NumberText.grouped(ymax * f),
                        style = style(10f, color = theme.p.faint.toColor(), tabular = true), textAlign = TextAlign.End, maxLines = 1,
                        modifier = Modifier.width((27 * sx).dp).offset(y = (yDp - 7).dp),
                    )
                }
                Text(
                    Strings.History.now, style = style(10.5f, FontWeight.Bold, theme.p.bg.toColor()),
                    modifier = Modifier.align(Alignment.TopEnd).padding(top = 10.dp, end = 6.dp).clip(RoundedCornerShape(4.dp)).background(theme.p.ink.toColor()).padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
            // x 라벨: 첫 구간(앞날 일부)과 반나절보다 짧은 구간(오늘 이른 시각)은 겹치므로 생략
            val every = if (nDays >= 30) 5 else 1
            val labels = segs.withIndex().filter { (i, s) -> i > 0 && (segs.size - 1 - i) % every == 0 && s.b - s.a >= 12 }.map { it.value }
            Layout(
                content = {
                    labels.forEach { s ->
                        Text(
                            if (nDays == 7) NumberText.monthDay(s.date) else s.date.takeLast(2).toInt().toString(),
                            style = style(10.5f, FontWeight.SemiBold, if (s.red) theme.p.up.toColor() else theme.p.muted.toColor(), tabular = true), maxLines = 1,
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth().height(18.dp),
            ) { measurables, constraints ->
                val placeables = measurables.map { it.measure(Constraints()) }
                layout(constraints.maxWidth, constraints.maxHeight) {
                    placeables.forEachIndexed { i, p ->
                        val s = labels[i]
                        val center = (30f + 300f * (s.a + s.b) / 2f / n) / 334f * constraints.maxWidth
                        p.place((center - p.width / 2).roundToInt(), 2.dp.roundToPx())
                    }
                }
            }
        }
    }
}

@Composable
private fun HeatTable(h: HistoryModel, focusId: String, unit: DisplayUnit, colors: Map<String, Color>, onFocus: (String) -> Unit) {
    val theme = LocalTheme.current
    val n = h.dates.size
    val gap = if (n > 14) 1.dp else 2.dp
    Column {
        Row(Modifier.fillMaxWidth().padding(start = 2.dp, end = 2.dp, top = 18.dp, bottom = 6.dp), verticalAlignment = Alignment.Bottom) {
            Text(if (unit == DisplayUnit.OCCUPANCY) Strings.History.dailyMaxOccupancy else Strings.History.dailyMinAvailable, style = style(13f, FontWeight.Bold, theme.p.ink.toColor()), modifier = Modifier.alignByBaseline())
            Spacer(Modifier.weight(1f))
            Text(Strings.History.dailyRange(NumberText.monthDay(h.dates.first().date), NumberText.monthDay(h.dates.last().date)), style = style(11f, color = theme.p.muted.toColor()), modifier = Modifier.alignByBaseline())
        }
        Row(Modifier.height(16.dp), horizontalArrangement = Arrangement.spacedBy(gap), verticalAlignment = Alignment.CenterVertically) {
            Spacer(Modifier.width(46.dp))
            h.dates.forEachIndexed { i, d ->
                Text(
                    if (n <= 14 || (n - 1 - i) % 5 == 0) d.date.takeLast(2).toInt().toString() else "",
                    style = style(if (n > 7) 9.5f else 10.5f, FontWeight.SemiBold, if (d.red) theme.p.up.toColor() else theme.p.muted.toColor(), tabular = true),
                    textAlign = TextAlign.Center, maxLines = 1, modifier = Modifier.weight(1f),
                )
            }
        }
        h.lines.forEach { line ->
            val on = line.id == focusId
            Row(Modifier.padding(top = 3.dp).height(24.dp).clickable { onFocus(line.id) }, horizontalArrangement = Arrangement.spacedBy(gap)) {
                Box(Modifier.width(46.dp).fillMaxHeight(), contentAlignment = Alignment.CenterStart) {
                    Text(historyName(line.id), style = style(12f, if (on) FontWeight.ExtraBold else FontWeight.SemiBold, (colors[line.id] ?: theme.p.ink.toColor()).copy(alpha = if (on) 1f else 0.75f)), maxLines = 1)
                }
                line.daily.forEachIndexed { i, d ->
                    val date = NumberText.monthDay(h.dates[i].date)
                    Box(
                        Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(if (n > 14) 2.dp else 4.dp)).background(d?.let { theme.tint(it.maxOccupancy) } ?: theme.p.chip.toColor())
                            .semantics {
                                contentDescription = d?.let {
                                    if (unit == DisplayUnit.OCCUPANCY) Strings.History.a11yCellOccupancy(date, NumberText.percent(it.maxOccupancy))
                                    else Strings.History.a11yCellAvailable(date, NumberText.grouped(it.minAvailable))
                                } ?: Strings.History.noData
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        if (n == 7 && d != null) {
                            Text(if (unit == DisplayUnit.OCCUPANCY) NumberText.percent(d.maxOccupancy) else NumberText.plain(d.minAvailable), style = style(10.5f, FontWeight.Bold, theme.p.ink.toColor(), tabular = true), maxLines = 1)
                        }
                    }
                }
            }
        }
    }
}
