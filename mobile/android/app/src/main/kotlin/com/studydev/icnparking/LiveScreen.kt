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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Matrix
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.studydev.icnparking.core.forecast.GroupForecast
import com.studydev.icnparking.core.generated.OccupancyBand
import com.studydev.icnparking.core.generated.Strings
import com.studydev.icnparking.core.generated.Terminal
import com.studydev.icnparking.core.generated.TerminalLayout
import com.studydev.icnparking.core.generated.ZoneCategory
import com.studydev.icnparking.core.generated.ZoneGroup
import com.studydev.icnparking.core.generated.ZoneTile
import com.studydev.icnparking.core.generated.Zones
import com.studydev.icnparking.core.presentation.NumberText
import com.studydev.icnparking.core.presentation.ParkingSnapshot
import com.studydev.icnparking.core.presentation.SheetTarget
import com.studydev.icnparking.core.presentation.ZoneNow
import com.studydev.icnparking.core.settings.DisplayUnit
import kotlin.math.roundToInt
import kotlin.math.tan

/** 실시간(디자인 5b/5e/5j/5n): 총계 → 단기 층 건물(flex 1.3) → 장기·타워 배치(flex 1) */
@Composable
fun LiveScreen(state: AppViewModel.UiState, model: AppViewModel) {
    val s = remember(state.latest, state.days, state.now) { state.snapshot } ?: return
    val layout = Zones.layout(state.terminal)
    Column(Modifier.fillMaxSize().padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 12.dp)) {
        TotalHeader(state.terminal, s.group(SheetTarget.Total(state.terminal)), state.unit) { model.openSheet(SheetTarget.Total(state.terminal)) }
        ShortPanel(s, state.terminal, layout, state.unit, model::openSheet, Modifier.weight(1.3f))
        Spacer(Modifier.height(12.dp))
        LongPanel(s, state.terminal, layout, state.unit, model::openSheet, Modifier.weight(1f))
    }
}

fun groupValue(g: GroupForecast, unit: DisplayUnit): String {
    val a = g.available ?: return "—"
    val o = g.occupancy ?: return "—"
    return if (unit == DisplayUnit.OCCUPANCY) NumberText.percent(o) else NumberText.grouped(a)
}

private fun unitLabel(unit: DisplayUnit) = if (unit == DisplayUnit.OCCUPANCY) Strings.Unit.percentUsed else Strings.Unit.carsLeft

/** 숫자 또는 대신하는 말(운영 중단·확인 필요·만차, 0.78배 크기) */
@Composable
fun ValueText(now: ZoneNow, unit: DisplayUnit, size: Float, unitSize: Float) {
    val theme = LocalTheme.current
    val word = now.word
    if (word != null) {
        Text(word, style = style((size * 0.78f).roundToInt().toFloat(), FontWeight.ExtraBold, if (now.isFull) theme.p.fullInk.toColor() else theme.p.muted.toColor()), maxLines = 1)
    } else {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                if (unit == DisplayUnit.OCCUPANCY) NumberText.percent(now.occupancy ?: 0.0) else NumberText.grouped(now.available ?: 0),
                style = style(size, FontWeight.ExtraBold, tabular = true).copy(letterSpacing = fs(-0.6f)), maxLines = 1,
                modifier = Modifier.alignByBaseline(),
            )
            Text(if (unit == DisplayUnit.OCCUPANCY) Strings.Unit.percent else Strings.Unit.cars, style = style(unitSize, FontWeight.SemiBold), maxLines = 1, modifier = Modifier.alignByBaseline())
        }
    }
}

@Composable
private fun TotalHeader(terminal: Terminal, g: GroupForecast, unit: DisplayUnit, onOpen: () -> Unit) {
    val theme = LocalTheme.current
    val title = Strings.Live.totalTitle(terminal.code)
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onOpen).padding(start = 2.dp, end = 2.dp, top = 4.dp, bottom = 16.dp)
            .semantics(mergeDescendants = true) { contentDescription = "$title, ${groupValue(g, unit)}${unitLabel(unit)}" },
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = style(13f, FontWeight.SemiBold, theme.p.muted.toColor()))
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(groupValue(g, unit), style = style(44f, FontWeight.ExtraBold, tabular = true).copy(letterSpacing = fs(-1.5f), lineHeight = fs(44f)), modifier = Modifier.alignByBaseline())
                Text(unitLabel(unit), style = style(16f, FontWeight.Bold), modifier = Modifier.alignByBaseline())
            }
        }
        g.occupancy?.let { o ->
            Text(
                OccupancyBand.of(o).label, style = style(13f, FontWeight.Bold, theme.p.ink.toColor()),
                modifier = Modifier.padding(bottom = 3.dp).clip(CircleShape).background(theme.tint(o)).padding(horizontal = 12.dp, vertical = 6.dp),
            )
        }
    }
}

/** 그룹 패널 머리글: "단기주차장 213대 남음" */
@Composable
private fun PanelHeader(title: String, ink: Color, g: GroupForecast, unit: DisplayUnit, onOpen: () -> Unit) {
    val theme = LocalTheme.current
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onOpen).padding(start = 2.dp, end = 2.dp, bottom = 4.dp).semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
    ) {
        Text(title, style = style(13f, FontWeight.Bold, ink), modifier = Modifier.alignByBaseline())
        Text(groupValue(g, unit), style = style(16f, FontWeight.ExtraBold, theme.p.ink.toColor(), tabular = true).copy(letterSpacing = fs(-0.3f)), modifier = Modifier.alignByBaseline())
        Text(unitLabel(unit), style = style(12f, FontWeight.SemiBold, theme.p.ink2.toColor()), modifier = Modifier.alignByBaseline())
    }
}

private val SKEW = tan(Math.toRadians(-20.0)).toFloat()

/** 기울인 슬래브(skewX −20°, 가운데 기준)를 dy만큼 내려 그린다 */
private fun slabPath(size: Size, inset: Float, bottom: Float, dy: Float, radius: Float): Path {
    val h = size.height - bottom
    val path = Path().apply { addRoundRect(RoundRect(inset, 0f, size.width - inset, h, CornerRadius(radius))) }
    val midY = h / 2
    path.transform(Matrix().apply { values[Matrix.SkewX] = SKEW; values[Matrix.TranslateX] = -SKEW * midY + SKEW * dy; values[Matrix.TranslateY] = dy })
    return path
}

@Composable
private fun ShortPanel(s: ParkingSnapshot, terminal: Terminal, layout: TerminalLayout, unit: DisplayUnit, onOpen: (SheetTarget) -> Unit, modifier: Modifier) {
    val theme = LocalTheme.current
    val compact = layout.floors.size >= 5
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(theme.p.gS.toColor()).padding(start = 10.dp, end = 10.dp, top = 8.dp, bottom = 10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        PanelHeader(Strings.Live.groupShort, theme.p.gSInk.toColor(), s.group(SheetTarget.Group(terminal, ZoneGroup.SHORT)), unit) { onOpen(SheetTarget.Group(terminal, ZoneGroup.SHORT)) }
        layout.floors.forEach { id ->
            FloorRow(s.zoneNow(id), compact, unit, Modifier.weight(1f)) { onOpen(SheetTarget.Zone(id)) }
            if (id == layout.groundAfter) GroundLine()
        }
    }
}

@Composable
private fun FloorRow(now: ZoneNow, compact: Boolean, unit: DisplayUnit, modifier: Modifier, onOpen: () -> Unit) {
    val theme = LocalTheme.current
    val thick = if (compact) 5f else 6f
    val top = if (now.dead) theme.p.chip.toColor() else theme.tint(now.occupancy ?: 0.0)
    val edge = if (now.dead) theme.p.outline.toColor() else theme.edge(now.occupancy ?: 0.0)
    Box(
        modifier.fillMaxWidth().heightIn(min = if (compact) 34.dp else 0.dp).clickable(onClick = onOpen).semantics(mergeDescendants = true) { contentDescription = now.accessibility },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.matchParentSize()) {
            val t = thick.dp.toPx()
            val inset = 14.dp.toPx()
            val r = 5.dp.toPx()
            drawPath(slabPath(size, inset, t, t, r), edge)
            drawPath(slabPath(size, inset, t, 0f, r), top)
        }
        Row(Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, bottom = thick.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Spacer(Modifier.weight(1f))
            Box(Modifier.width(56.dp), contentAlignment = Alignment.CenterEnd) {
                Box(
                    Modifier.clip(CircleShape).background(theme.p.bg.toColor()).widthIn(min = 40.dp).height(if (compact) 20.dp else 24.dp).padding(horizontal = 6.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(Zones.byId[now.id]?.shortName ?: now.id, style = style(if (compact) 11.5f else 12.5f, FontWeight.Bold, theme.p.ink2.toColor()), maxLines = 1)
                }
            }
            Box(Modifier.width(112.dp), contentAlignment = Alignment.CenterStart) {
                ValueText(now, unit, if (compact) 19f else 24f, if (compact) 12f else 14f)
            }
            Spacer(Modifier.weight(1f))
        }
    }
}

@Composable
private fun LongPanel(s: ParkingSnapshot, terminal: Terminal, layout: TerminalLayout, unit: DisplayUnit, onOpen: (SheetTarget) -> Unit, modifier: Modifier) {
    val theme = LocalTheme.current
    val rows = remember(layout) {
        val out = mutableListOf<List<ZoneTile>>()
        var current = mutableListOf<ZoneTile>()
        for (t in layout.tiles) {
            current += t
            if (current.sumOf { it.span } >= 2) { out += current; current = mutableListOf() }
        }
        if (current.isNotEmpty()) out += current
        out
    }
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(theme.p.gL.toColor()).padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        PanelHeader(Strings.Live.groupLong, theme.p.gLInk.toColor(), s.group(SheetTarget.Group(terminal, ZoneGroup.LONG)), unit) { onOpen(SheetTarget.Group(terminal, ZoneGroup.LONG)) }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            rows.forEach { row ->
                Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { tile -> LongTile(s.zoneNow(tile.id), unit, Modifier.weight(tile.span.toFloat())) { onOpen(SheetTarget.Zone(tile.id)) } }
                }
            }
        }
    }
}

/** 장기 칸: 노면 = 주차칸 선, 타워 = 두께 있는 블록, 예약 = 바탕 + 외곽선 */
@Composable
private fun LongTile(now: ZoneNow, unit: DisplayUnit, modifier: Modifier, onOpen: () -> Unit) {
    val theme = LocalTheme.current
    val category = Zones.byId[now.id]?.category ?: ZoneCategory.LONG
    val o = now.occupancy ?: 0.0
    val tower = category == ZoneCategory.TOWER && !now.dead
    val base = modifier.fillMaxSize().padding(bottom = if (tower) 5.dp else 0.dp)
    val shaped = when {
        category == ZoneCategory.RESERVED -> base.clip(RoundedCornerShape(8.dp)).background(theme.p.bg.toColor()).border(1.5.dp, theme.p.outline.toColor(), RoundedCornerShape(8.dp))
        now.dead -> base.clip(RoundedCornerShape(8.dp)).background(theme.p.chip.toColor())
        tower -> base
        else -> base.clip(RoundedCornerShape(6.dp)).background(theme.tint(o))
    }
    Box(shaped.clickable(onClick = onOpen).semantics(mergeDescendants = true) { contentDescription = now.accessibility }, contentAlignment = Alignment.Center) {
        if (tower) {
            Box(Modifier.matchParentSize().offset(y = 5.dp).clip(RoundedCornerShape(8.dp)).background(theme.edge(o)))
            Box(Modifier.matchParentSize().clip(RoundedCornerShape(8.dp)).background(theme.tint(o)))
        }
        if (category == ZoneCategory.LONG && !now.dead) {
            val stall = theme.p.stall.toColor()
            Canvas(Modifier.matchParentSize()) {
                val w = 1.5.dp.toPx()
                val band = 9.dp.toPx()
                var x = 0f
                while (x < size.width) {
                    drawRect(stall, Offset(x, 0f), Size(w, band))
                    drawRect(stall, Offset(x, size.height - band), Size(w, band))
                    x += 15.dp.toPx()
                }
            }
        }
        Row(Modifier.padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(Zones.byId[now.id]?.shortName ?: now.id, style = style(13f, FontWeight.Bold, theme.p.ink2.toColor()), maxLines = 1)
            ValueText(now, unit, 20f, 13f)
        }
    }
}
