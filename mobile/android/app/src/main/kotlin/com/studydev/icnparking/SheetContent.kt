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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.studydev.icnparking.core.forecast.text
import com.studydev.icnparking.core.generated.OccupancyBand
import com.studydev.icnparking.core.generated.Strings
import com.studydev.icnparking.core.presentation.NumberText
import com.studydev.icnparking.core.presentation.SeriesPoint
import com.studydev.icnparking.core.presentation.SheetModel
import com.studydev.icnparking.core.presentation.SheetTarget

/** 상세 시트(디자인 5i): ModalBottomSheet(r28) 88% 높이 */
@Composable
fun SheetContent(target: SheetTarget, state: AppViewModel.UiState, onClose: () -> Unit) {
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
            if (m.cells.isNotEmpty()) Cells(m)
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
    val maxY = maxOf(1.0, (m.actual + m.forecast + m.base).maxOfOrNull { it.available } ?: 1.0) * 1.08
    Column(
        Modifier.padding(top = 14.dp).fillMaxWidth().border(1.dp, line, RoundedCornerShape(12.dp)).padding(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 6.dp)
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
        Canvas(Modifier.fillMaxWidth().height(128.dp)) {
            val x = { o: Int -> (o + 36) / 72f * size.width }
            val y = { v: Double -> (size.height - 4.dp.toPx()) * (1 - (v / maxY).toFloat()) + 4.dp.toPx() }
            fun path(points: List<SeriesPoint>) = Path().apply { points.forEachIndexed { i, p -> if (i == 0) moveTo(x(p.offset), y(p.available)) else lineTo(x(p.offset), y(p.available)) } }
            drawLine(line, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx())
            drawLine(faint, Offset(x(0), 4.dp.toPx()), Offset(x(0), size.height), 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(2.dp.toPx(), 3.dp.toPx())))
            if (m.base.isNotEmpty()) drawPath(path(m.base), faint, style = Stroke(1.6.dp.toPx(), cap = StrokeCap.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(1.dp.toPx(), 4.dp.toPx()))))
            if (m.actual.isNotEmpty()) drawPath(path(m.actual), ink, style = Stroke(2.2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            if (m.forecast.isNotEmpty()) drawPath(path(m.forecast), tint, style = Stroke(2.2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            (m.forecast.firstOrNull() ?: m.actual.lastOrNull())?.let { p ->
                drawCircle(sheet, 4.dp.toPx(), Offset(x(0), y(p.available)))
                drawCircle(ink, 4.dp.toPx(), Offset(x(0), y(p.available)), style = Stroke(2.dp.toPx()))
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 6.dp)) {
            Text(m.startLabel, style = style(10f, color = faint, tabular = true))
            Spacer(Modifier.weight(1f))
            Text(Strings.Sheet.nowMarker(m.nowLabel), style = style(10f, FontWeight.SemiBold, ink, tabular = true))
            Spacer(Modifier.weight(1f))
            Text(m.endLabel, style = style(10f, color = faint, tabular = true))
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

@Composable
private fun Cells(m: SheetModel) {
    val theme = LocalTheme.current
    val now = m.nowPair
    Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        m.cells.chunked(3).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                row.forEach { cell ->
                    val d = now?.let { NumberText.round(cell.value.available) - NumberText.round(it.available) } ?: 0
                    Column(
                        Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(theme.tint(cell.value.occupancy)).padding(start = 10.dp, end = 10.dp, top = 10.dp, bottom = 9.dp)
                            .semantics(mergeDescendants = true) { contentDescription = Strings.Forecast.a11yCell(cell.time.label, NumberText.grouped(cell.value.available), NumberText.change(d)) },
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Text(cell.time.label, style = style(11.5f, color = theme.p.ink2.toColor(), tabular = true))
                        Row {
                            Text(NumberText.grouped(cell.value.available), style = style(20f, FontWeight.Bold, theme.p.ink.toColor(), tabular = true), modifier = Modifier.alignByBaseline())
                            Text(Strings.Unit.cars, style = style(13f, FontWeight.SemiBold, theme.p.ink.toColor()), modifier = Modifier.alignByBaseline())
                        }
                        Text(NumberText.delta(d), style = style(12f, FontWeight.Bold, theme.deltaColor(d), tabular = true))
                    }
                }
            }
        }
    }
}
