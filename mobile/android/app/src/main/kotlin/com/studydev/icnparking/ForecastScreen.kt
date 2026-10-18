package com.studydev.icnparking

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.studydev.icnparking.core.generated.Strings
import com.studydev.icnparking.core.presentation.ForecastRow
import com.studydev.icnparking.core.presentation.ForecastTable
import com.studydev.icnparking.core.presentation.ForecastTableItem
import com.studydev.icnparking.core.presentation.NumberText
import com.studydev.icnparking.core.settings.DisplayUnit
import com.studydev.icnparking.core.time.SlotTime

/** 예측(디자인 5d/5f/5h/5k/5o): 열 50 | 1.15fr | 1fr×6, 간격 3, 행 높이 최대 52 */
@Composable
fun ForecastScreen(state: AppViewModel.UiState, model: AppViewModel) {
    val theme = LocalTheme.current
    val table = remember(state.latest, state.days, state.now, state.terminal) { state.snapshot?.let { ForecastTable(it, state.terminal) } } ?: return
    BoxWithConstraints(Modifier.fillMaxSize().padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 12.dp)) {
        val cols = Columns(maxWidth)
        val rowCount = table.items.count { it is ForecastTableItem.Row }
        val labelCount = table.items.size - rowCount
        val rowHeight = ((maxHeight - 26.dp - 32.dp * labelCount - 2.dp) / rowCount).coerceIn(30.dp, 52.dp)
        Column {
            Row(Modifier.height(26.dp), horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.width(cols.name))
                Text(Strings.Forecast.now, style = style(12f, FontWeight.ExtraBold, theme.p.ink.toColor()), textAlign = TextAlign.Center, modifier = Modifier.width(cols.now))
                table.times.forEach { Text(it.label, style = style(12f, FontWeight.SemiBold, theme.p.muted.toColor(), tabular = true), textAlign = TextAlign.Center, maxLines = 1, modifier = Modifier.width(cols.cell)) }
            }
            table.items.forEach { item ->
                when (item) {
                    is ForecastTableItem.Label -> Text(item.text, style = style(12f, FontWeight.Bold, theme.p.ink2.toColor()), modifier = Modifier.padding(start = 2.dp, end = 2.dp, top = 12.dp, bottom = 4.dp))
                    is ForecastTableItem.Row -> ForecastRowView(
                        item.row, table.times, cols, state.unit, state.settings.showDelta,
                        Modifier.height(rowHeight).padding(bottom = if (item.row.isTotal) 2.dp else 0.dp).clickable { model.openSheet(item.row.target) },
                    )
                }
            }
        }
    }
}

/** 열 너비: 50 | 1.15fr | 1fr × 6, 간격 3 */
class Columns(width: Dp) {
    val name = 50.dp
    private val unit = ((width - 50.dp - 3.dp * 7) / 7.15f).coerceAtLeast(0.dp)
    val now = unit * 1.15f
    val cell = unit
}

@Composable
private fun ForecastRowView(row: ForecastRow, times: List<SlotTime>, cols: Columns, unit: DisplayUnit, showDelta: Boolean, modifier: Modifier) {
    val theme = LocalTheme.current
    val occ = unit == DisplayUnit.OCCUPANCY
    val shape = RoundedCornerShape(6.dp)
    Row(modifier.fillMaxWidth().padding(vertical = 1.5.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        Box(Modifier.width(cols.name).fillMaxHeight().padding(start = 4.dp), contentAlignment = Alignment.CenterStart) {
            Text(row.name, style = style(if (row.isTotal) 13.5f else 12.5f, if (row.isTotal) FontWeight.ExtraBold else FontWeight.SemiBold, theme.p.ink2.toColor()), maxLines = 1)
        }
        val now = row.now
        Box(
            Modifier.width(cols.now).fillMaxHeight().clip(shape).background(if (now == null) theme.p.chip.toColor() else theme.tint(now.occupancy))
                .semantics { contentDescription = now?.let { Strings.Forecast.a11yNow(NumberText.grouped(it.available)) } ?: row.reason?.text.orEmpty() },
            contentAlignment = Alignment.Center,
        ) {
            Text(now?.text(unit) ?: "—", style = style(if (occ) 13.5f else 14.5f, FontWeight.ExtraBold, if (now == null) theme.p.muted.toColor() else theme.p.ink.toColor(), tabular = true).copy(letterSpacing = fs(-0.5f)), maxLines = 1)
        }
        val reason = row.reason
        if (reason != null) {
            Box(Modifier.weight(1f).fillMaxHeight().clip(shape).background(theme.p.chip.toColor()), contentAlignment = Alignment.Center) {
                Text(reason.text, style = style(12f, FontWeight.SemiBold, theme.p.muted.toColor()), maxLines = 1)
            }
        } else if (now != null) {
            times.zip(row.cells).forEach { (time, cell) ->
                val d = cell.delta(now, unit)
                Column(
                    Modifier.width(cols.cell).fillMaxHeight().clip(shape).background(theme.tint(cell.occupancy)).semantics(mergeDescendants = true) {
                        contentDescription = Strings.Forecast.a11yCell(time.label, NumberText.grouped(cell.available), NumberText.change(NumberText.round(cell.available) - NumberText.round(now.available)))
                    },
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(cell.text(unit), style = style(if (occ) 12.5f else 13.5f, FontWeight.Bold, theme.p.ink.toColor(), tabular = true).copy(letterSpacing = fs(-0.4f)), maxLines = 1)
                    if (showDelta) Text(NumberText.delta(d), style = style(9.5f, FontWeight.Bold, theme.deltaColor(d), tabular = true), maxLines = 1)
                }
            }
        }
    }
}
