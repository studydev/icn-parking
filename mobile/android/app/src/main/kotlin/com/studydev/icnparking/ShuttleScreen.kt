package com.studydev.icnparking

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.studydev.icnparking.core.generated.Strings
import com.studydev.icnparking.core.generated.Tokens
import com.studydev.icnparking.core.generated.Zones
import com.studydev.icnparking.core.presentation.ShuttleText
import com.studydev.icnparking.core.shuttle.PreparedRoute
import com.studydev.icnparking.core.shuttle.PreparedStop
import kotlinx.coroutines.delay

/** 셔틀(디자인 5r/5s): 노선 5칸 → 설명 → 카드 → 정차 순서. 15초마다 다시 계산, 선택 승강장 자동 스크롤 */
@Composable
fun ShuttleScreen(state: AppViewModel.UiState, model: AppViewModel) {
    val theme = LocalTheme.current
    val schedule = model.shuttle
    if (schedule == null) {
        Message(Strings.Loading.shuttle)
        return
    }
    LaunchedEffect(Unit) {
        while (true) {
            delay(15_000)
            model.touchClock()
        }
    }
    val order = Zones.layout(state.terminal).shuttleRoutes
    val route = schedule.route(state.settings.shuttleRoute(state.terminal)) ?: return
    val sid = state.settings.shuttleStop(route.id) ?: route.route.defaultStop
    val stop = route.stops.firstOrNull { it.stop.id == sid } ?: route.stops.first()
    val nowSeconds = state.kst.secondsOfDay
    val color = Tokens.shuttleRoutes[route.id]?.color?.toColor() ?: theme.p.tint.toColor()
    val soft = Tokens.shuttleRoutes[route.id]?.soft(theme.mode)?.toColor() ?: theme.p.chip.toColor()
    val card = ShuttleText.card(route.route, stop, stop.next(2, nowSeconds))
    val listState = rememberLazyListState()
    LaunchedEffect(route.id, stop.stop.id) {
        val index = route.stops.indexOf(stop)
        listState.animateScrollToItem((index - 2).coerceAtLeast(0))
    }

    Column(Modifier.fillMaxSize().padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 12.dp)) {
        Row(Modifier.padding(top = 2.dp, bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            order.forEach { id ->
                val r = schedule.route(id) ?: return@forEach
                val on = id == route.id
                val c = Tokens.shuttleRoutes[id]?.color?.toColor() ?: theme.p.tint.toColor()
                Row(
                    Modifier.weight(1f).height(34.dp).clip(RoundedCornerShape(10.dp)).background(if (on) c else theme.p.chip.toColor()).clickable { model.setShuttleRoute(id) }
                        .semantics(mergeDescendants = true) { contentDescription = "${r.route.name} · ${r.route.desc}"; selected = on },
                    horizontalArrangement = Arrangement.spacedBy(5.dp, Alignment.CenterHorizontally),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(7.dp).clip(CircleShape).background(if (on) Color.White else c))
                    Text(r.route.name, style = style(12.5f, FontWeight.Bold, if (on) Color.White else theme.p.ink2.toColor()), maxLines = 1)
                }
            }
        }
        Text(Strings.Shuttle.routeInfo(route.route.desc, route.route.headway, route.route.hours), style = styleS(12f, color = theme.p.muted.toColor()), modifier = Modifier.padding(start = 2.dp, end = 2.dp, bottom = 10.dp))
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(soft).padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 12.dp).semantics(mergeDescendants = true) {}) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(stop.stop.label, style = style(13f, FontWeight.Bold, theme.p.ink2.toColor()), maxLines = 1, modifier = Modifier.alignByBaseline())
                Text(stop.stop.note, style = style(11.5f, FontWeight.Medium, theme.p.muted.toColor()), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.alignByBaseline())
            }
            Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(card.w1, style = style(38f, FontWeight.ExtraBold, theme.p.ink.toColor(), tabular = true).copy(letterSpacing = fs(-1.2f), lineHeight = fs(38f)), maxLines = 1)
                    Text(card.at1, style = style(12.5f, FontWeight.SemiBold, theme.p.ink2.toColor(), tabular = true))
                }
                Column(Modifier.padding(bottom = 1.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(card.w2, style = style(20f, FontWeight.Bold, theme.p.ink2.toColor(), tabular = true), maxLines = 1)
                    Text(card.at2, style = style(12f, color = theme.p.muted.toColor(), tabular = true))
                }
            }
            if (card.mark.isNotEmpty()) Text(card.mark, style = style(12f, FontWeight.Bold, theme.p.warnInk.toColor()), modifier = Modifier.padding(top = 8.dp))
            Text(card.span, style = style(11.5f, color = theme.p.muted.toColor(), tabular = true), modifier = Modifier.padding(top = 10.dp))
        }
        Row(Modifier.fillMaxWidth().padding(start = 6.dp, end = 12.dp, top = 14.dp, bottom = 4.dp)) {
            Text(Strings.Shuttle.stopsHeader(route.stops.size.toString()), style = style(12f, FontWeight.Bold, theme.p.ink2.toColor()))
            Box(Modifier.weight(1f))
            Text(Strings.Shuttle.nextArrival, style = style(12f, color = theme.p.muted.toColor()))
        }
        LazyColumn(Modifier.weight(1f), state = listState) {
            itemsIndexed(route.stops, key = { _, s -> s.stop.id }) { i, s ->
                StopRow(route, s, i, s.stop.id == stop.stop.id, color, soft, nowSeconds) { model.setShuttleStop(route.id, s.stop.id) }
            }
            item {
                Text(ShuttleText.tail(route.route), style = style(11.5f, color = theme.p.muted.toColor()), modifier = Modifier.padding(start = 36.dp, end = 2.dp, top = 8.dp, bottom = 4.dp))
            }
        }
        Text(Strings.Shuttle.asOf(schedule.asOf), style = style(11f, color = theme.p.faint.toColor()), modifier = Modifier.padding(start = 2.dp, end = 2.dp, top = 8.dp))
    }
}

@Composable
private fun StopRow(route: PreparedRoute, stop: PreparedStop, index: Int, selected: Boolean, color: Color, soft: Color, nowSeconds: Int, onClick: () -> Unit) {
    val theme = LocalTheme.current
    val n = route.stops.size
    val first = index == 0 && !route.route.loop
    val last = index == n - 1 && !route.route.loop && route.route.after == null
    val next = stop.next(1, nowSeconds).firstOrNull()
    val today = next?.tomorrow == false
    val bg = theme.p.bg.toColor()
    Row(
        Modifier.fillMaxWidth().heightIn(min = 46.dp).clip(RoundedCornerShape(12.dp)).background(if (selected) soft else Color.Transparent)
            // 레일은 행 전체 높이에 그린다(LazyColumn 안에서는 자식 Canvas가 행 높이를 모름)
            .drawBehind {
                val x = 16.dp.toPx()
                drawLine(color, Offset(x, if (first) size.height / 2 else 0f), Offset(x, if (last) size.height / 2 else size.height), 2.dp.toPx())
                val r = 6.dp.toPx()
                drawCircle(if (selected) color else bg, r, Offset(x, size.height / 2))
                drawCircle(color, r - 1.25.dp.toPx(), Offset(x, size.height / 2), style = Stroke(2.5.dp.toPx()))
            }
            .clickable(onClick = onClick)
            .padding(start = 6.dp, end = 12.dp)
            .semantics(mergeDescendants = true) {
                contentDescription = next?.let { Strings.Shuttle.a11yStop(route.route.name, stop.stop.label, ShuttleText.wait(it), ShuttleText.hm(it.departure.minuteOfDay)) } ?: stop.stop.label
                this.selected = selected
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.width(20.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(stop.stop.label, style = styleS(14f, if (selected) FontWeight.ExtraBold else FontWeight.SemiBold, theme.p.ink.toColor()), maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (stop.stop.note.isNotEmpty()) Text(stop.stop.note, style = styleS(11f, color = theme.p.muted.toColor()), maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Text(
            ShuttleText.wait(next),
            style = if (today) styleS(15f, if (selected) FontWeight.ExtraBold else FontWeight.Bold, theme.p.ink.toColor(), tabular = true) else styleS(12f, FontWeight.SemiBold, theme.p.muted.toColor(), tabular = true),
        )
    }
}
