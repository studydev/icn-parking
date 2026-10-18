package com.studydev.icnparking

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.studydev.icnparking.core.forecast.text
import com.studydev.icnparking.core.generated.OccupancyBand
import com.studydev.icnparking.core.generated.Strings
import com.studydev.icnparking.core.presentation.NumberText
import com.studydev.icnparking.core.presentation.SeriesPoint
import com.studydev.icnparking.core.presentation.SheetModel
import com.studydev.icnparking.core.presentation.SheetTarget
import com.studydev.icnparking.core.presentation.SheetTimeline

/** 상세 시트(디자인 5i): ModalBottomSheet(r28) 88% 높이. 그래프 = 지난 2시간 실측 + 6시간 예상(30분 점마다 숫자), 아래 = 시간대별 세로 표 */
@Composable
fun SheetContent(target: SheetTarget, state: AppViewModel.UiState, onSelect: (SheetTarget) -> Unit, onClose: () -> Unit) {
    val theme = LocalTheme.current
    val m = remember(target, state.latest, state.days, state.now) { state.snapshot?.let { SheetModel.of(it, target) } } ?: return
    Column(Modifier.fillMaxWidth().fillMaxHeight(0.88f)) {
        Row(Modifier.padding(start = 20.dp, end = 12.dp, top = 6.dp), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Column(Modifier.weight(1f)) {
                Text(m.kicker, style = style(12.5f, color = theme.p.muted.toColor()))
                Text(m.name, style = style(22f, FontWeight.Bold, theme.p.ink.toColor()).copy(letterSpacing = fs(-0.3f)), modifier = Modifier.padding(top = 2.dp))
            }
            Box(
                Modifier.size(36.dp).clip(CircleShape).background(theme.p.chip.toColor()).clickable(onClick = onClose).semantics { contentDescription = Strings.Sheet.close },
                contentAlignment = Alignment.Center,
            ) { Text("✕", style = style(15f, color = theme.p.ink.toColor())) }
        }
        Column(Modifier.verticalScroll(rememberScrollState()).padding(start = 20.dp, end = 20.dp, top = 6.dp, bottom = 40.dp)) {
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(Strings.Sheet.remaining, style = style(13f, color = theme.p.muted.toColor()), modifier = Modifier.alignByBaseline())
                val word = (target as? SheetTarget.Zone)?.let { state.snapshot?.zoneNow(it.id)?.word } ?: Strings.Zone.missing
                Text(
                    m.available?.let { NumberText.grouped(it) } ?: word,
                    style = style(if (m.available != null) 30f else 22f, FontWeight.Bold, if (m.available != null) theme.p.ink.toColor() else theme.p.muted.toColor(), tabular = true).copy(letterSpacing = fs(-0.6f)),
                    modifier = Modifier.alignByBaseline(),
                )
                Text(Strings.Sheet.ofTotal(NumberText.grouped(m.capacity)), style = style(14f, color = theme.p.muted.toColor(), tabular = true), modifier = Modifier.alignByBaseline())
                Spacer(Modifier.weight(1f))
                m.occupancy?.let { o ->
                    Text(Strings.Sheet.bandPercent(OccupancyBand.of(o).label, NumberText.percent(o)), style = style(13f, FontWeight.SemiBold, theme.p.ink.toColor()), modifier = Modifier.alignByBaseline())
                }
            }
            Graph(m)
            Text(
                m.explain, style = style(13f, color = theme.p.ink.toColor()).copy(lineHeight = fs(20f)),
                modifier = Modifier.padding(top = 12.dp).fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(theme.p.chip.toColor()).padding(horizontal = 14.dp, vertical = 12.dp),
            )
            TimelineTable(m.timeline, onSelect, Modifier.padding(top = 18.dp))
            Text(m.footer(state.freshness?.text.orEmpty()), style = style(12f, color = theme.p.faint.toColor()).copy(lineHeight = fs(18f)), modifier = Modifier.padding(top = 12.dp))
        }
    }
}

@Composable
private fun Graph(m: SheetModel) {
    val theme = LocalTheme.current
    val ink = theme.p.ink.toColor()
    val tint = theme.p.tint.toColor()
    val faint = theme.p.faint.toColor()
    val line = theme.p.line.toColor()
    val sheet = theme.p.sheet.toColor()
    val maxY = maxOf(1.0, (m.actual + m.forecast + m.base).maxOfOrNull { it.available } ?: 1.0) * 1.12
    val measurer = rememberTextMeasurer()
    val pointStyle = style(9.5f, FontWeight.SemiBold, tabular = true)
    val nowStyle = style(11f, FontWeight.ExtraBold, tabular = true)
    val axisStyle = style(10f, color = faint, tabular = true)
    val axisNowStyle = style(10f, FontWeight.SemiBold, ink, tabular = true)
    Column(
        Modifier.padding(top = 14.dp).fillMaxWidth().border(1.dp, line, RoundedCornerShape(12.dp)).padding(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 8.dp)
            .semantics(mergeDescendants = true) {
                val now = m.available
                val later = m.forecast.lastOrNull()?.available
                contentDescription = when {
                    now == null -> m.explain
                    later == null -> Strings.Forecast.a11yNow(NumberText.grouped(now))
                    else -> Strings.Sheet.a11yGraph(NumberText.grouped(now), NumberText.grouped(later))
                }
            },
    ) {
        // −2시간 … +6시간. 30분 점마다 숫자(위·아래 번갈아 두어 겹치지 않게)
        Canvas(Modifier.fillMaxWidth().height(176.dp)) {
            val top = 16.dp.toPx()
            val bottom = 36.dp.toPx()
            val plotH = size.height - top - bottom
            val pad = 12.dp.toPx()
            val x = { o: Int -> (o + 24) / 96f * (size.width - 2 * pad) + pad }
            val y = { v: Double -> top + plotH * (1 - (v / maxY).toFloat()) }
            fun path(points: List<SeriesPoint>) = Path().apply { points.forEachIndexed { i, p -> if (i == 0) moveTo(x(p.offset), y(p.available)) else lineTo(x(p.offset), y(p.available)) } }
            drawLine(line, Offset(0f, top + plotH), Offset(size.width, top + plotH), 1.dp.toPx())
            drawLine(faint, Offset(x(0), 2.dp.toPx()), Offset(x(0), top + plotH), 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(2.dp.toPx(), 3.dp.toPx())))
            if (m.base.isNotEmpty()) drawPath(path(m.base), faint, style = Stroke(1.6.dp.toPx(), cap = StrokeCap.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(1.dp.toPx(), 4.dp.toPx()))))
            if (m.actual.isNotEmpty()) drawPath(path(m.actual), ink, style = Stroke(2.2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            if (m.forecast.isNotEmpty()) drawPath(path(m.forecast), tint, style = Stroke(2.2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            // 점 + 숫자: 실측(ink) → 예상(tint), 지금 점은 한 번만
            val labeled = m.actual.filter { it.offset != 0 }.map { it to ink } +
                (if (m.forecast.isEmpty()) m.actual.filter { it.offset == 0 } else m.forecast).map { it to if (it.offset == 0) ink else tint }
            labeled.forEachIndexed { i, (pt, color) ->
                val c = Offset(x(pt.offset), y(pt.available))
                val isNow = pt.offset == 0
                if (isNow) {
                    drawCircle(sheet, 4.5.dp.toPx(), c)
                    drawCircle(color, 4.5.dp.toPx(), c, style = Stroke(2.dp.toPx()))
                } else drawCircle(color, 2.6.dp.toPx(), c)
                val text = measurer.measure(NumberText.grouped(pt.available), (if (isNow) nowStyle else pointStyle).copy(color = color))
                val above = i % 2 == 0
                val tx = (c.x - text.size.width / 2f).coerceIn(0f, size.width - text.size.width)
                val ty = if (above) c.y - 7.dp.toPx() - text.size.height else c.y + 7.dp.toPx()
                drawText(text, topLeft = Offset(tx, ty))
            }
            // 시각 축: "지금" 먼저 놓고, 그와 겹치는 정시 칸은 건너뛴다
            val taken = mutableListOf<ClosedFloatingPointRange<Float>>()
            m.axis.sortedByDescending { it.isNow }.forEach { a ->
                val text = measurer.measure(a.label, if (a.isNow) axisNowStyle else axisStyle)
                val w = text.size.width.toFloat()
                val cx = x(a.offset).coerceIn(w / 2, size.width - w / 2)
                val gap = 4.dp.toPx()
                val span = (cx - w / 2 - gap)..(cx + w / 2 + gap)
                if (taken.any { it.start <= span.endInclusive && span.start <= it.endInclusive }) return@forEach
                taken += span
                drawText(text, topLeft = Offset(cx - w / 2, size.height - 14.dp.toPx() - text.size.height / 2f))
            }
        }
        Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            LegendItem(Strings.Sheet.legendActual, ink, false)
            if (m.forecast.isNotEmpty()) LegendItem(Strings.Sheet.legendForecast, tint, false)
            if (m.base.isNotEmpty()) LegendItem(Strings.Sheet.legendLastWeek, faint, true)
        }
    }
}

@Composable
private fun LegendItem(text: String, color: Color, dotted: Boolean) {
    val theme = LocalTheme.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        Canvas(Modifier.width(14.dp).height(2.dp)) {
            drawLine(color, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), 2.dp.toPx(), pathEffect = if (dotted) PathEffect.dashPathEffect(floatArrayOf(2.dp.toPx(), 2.dp.toPx())) else null)
        }
        Text(text, style = style(11.5f, color = theme.p.muted.toColor()))
    }
}

/** 시간대별 세로 표: 왼쪽 = 시간 흐름(셔틀 정차 순서처럼 레일), 오른쪽 = 선택한 곳이 앞에 오는 주차장 열 */
@Composable
private fun TimelineTable(timeline: SheetTimeline, onSelect: (SheetTarget) -> Unit, modifier: Modifier = Modifier) {
    val theme = LocalTheme.current
    val tint = theme.p.tint.toColor()
    val sheet = theme.p.sheet.toColor()
    Column(modifier) {
        Text(Strings.Sheet.timelineTitle, style = style(13f, FontWeight.Bold, theme.p.ink.toColor()))
        Text(Strings.Sheet.timelineNote, style = style(11f, color = theme.p.muted.toColor()), modifier = Modifier.padding(top = 2.dp))
        Row(Modifier.padding(top = 10.dp, bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Spacer(Modifier.width(70.dp))
            timeline.columns.forEach { col ->
                Text(
                    col.name, maxLines = 1, textAlign = TextAlign.Center,
                    style = style(12f, if (col.selected) FontWeight.ExtraBold else FontWeight.SemiBold, if (col.selected) theme.p.ink.toColor() else theme.p.muted.toColor()),
                    modifier = Modifier.weight(1f).clickable(enabled = !col.selected) { onSelect(col.target) },
                )
            }
        }
        timeline.rows.forEachIndexed { i, row ->
            val last = i == timeline.rows.lastIndex
            Row(
                Modifier.height(34.dp).semantics(mergeDescendants = true) {
                    val time = if (row.isNow) Strings.Forecast.now else row.time.label
                    contentDescription = (listOf(time) + timeline.columns.zip(row.values).map { (col, v) -> "${col.name} ${v?.let { NumberText.grouped(it.available) + Strings.Unit.cars } ?: "—"}" }).joinToString(", ")
                },
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(Modifier.width(70.dp).fillMaxHeight(), verticalAlignment = Alignment.CenterVertically) {
                    Canvas(Modifier.width(20.dp).fillMaxHeight()) {
                        val cx = 10.dp.toPx()
                        val cy = size.height / 2
                        drawLine(tint, Offset(cx, if (i == 0) cy else 0f), Offset(cx, if (last) cy else size.height), 2.dp.toPx())
                        drawCircle(if (row.isNow) tint else sheet, 5.5.dp.toPx(), Offset(cx, cy))
                        drawCircle(tint, 4.25.dp.toPx(), Offset(cx, cy), style = Stroke(2.5.dp.toPx()))
                    }
                    Text(
                        if (row.isNow) Strings.Forecast.now else row.time.label, maxLines = 1,
                        style = style(12.5f, if (row.isNow) FontWeight.ExtraBold else FontWeight.SemiBold, if (row.isNow) theme.p.ink.toColor() else theme.p.ink2.toColor(), tabular = true),
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
                timeline.columns.forEachIndexed { c, col ->
                    val v = row.values[c]
                    val shape = RoundedCornerShape(6.dp)
                    Box(
                        Modifier.weight(1f).fillMaxHeight().padding(vertical = 2.dp).clip(shape)
                            .background(if (v == null) theme.p.chip.toColor() else theme.tint(v.occupancy))
                            .then(if (col.selected && v != null) Modifier.border(1.5.dp, theme.p.ink.toColor().copy(alpha = 0.55f), shape) else Modifier)
                            .clickable(enabled = !col.selected) { onSelect(col.target) },
                        contentAlignment = Alignment.Center,
                    ) {
                        if (v == null) Text("—", style = style(12f, FontWeight.SemiBold, theme.p.muted.toColor()))
                        else Text(
                            NumberText.grouped(v.available), maxLines = 1,
                            style = style(if (col.selected) 14f else 12.5f, if (col.selected) FontWeight.ExtraBold else FontWeight.SemiBold, theme.p.ink.toColor(), tabular = true),
                        )
                    }
                }
            }
        }
    }
}
