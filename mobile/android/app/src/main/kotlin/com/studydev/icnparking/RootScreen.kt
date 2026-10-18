package com.studydev.icnparking

import androidx.annotation.DrawableRes
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import com.studydev.icnparking.core.forecast.isWarning
import com.studydev.icnparking.core.forecast.text
import com.studydev.icnparking.core.generated.Strings
import com.studydev.icnparking.core.generated.Terminal
import com.studydev.icnparking.core.presentation.SheetTarget
import com.studydev.icnparking.core.presentation.ShuttleText
import com.studydev.icnparking.core.settings.DisplayUnit
import kotlinx.coroutines.delay

/** README 하단 탭(Material Symbols) */
enum class AppTab(val label: String, val title: String, @DrawableRes val icon: Int) {
    LIVE(Strings.Tab.live, Strings.Title.live, R.drawable.ic_tab_local_parking),
    FORECAST(Strings.Tab.forecast, Strings.Title.forecast, R.drawable.ic_tab_schedule),
    HISTORY(Strings.Tab.history, Strings.Title.history, R.drawable.ic_tab_show_chart),
    SHUTTLE(Strings.Tab.shuttle, Strings.Title.shuttle, R.drawable.ic_tab_directions_bus),
    SETTINGS(Strings.Tab.settings, Strings.Title.settings, R.drawable.ic_tab_tune),
    ;

    /** 헤더 점유율|주차면: 설정·셔틀 탭에선 숨김 */
    val showsUnit: Boolean get() = this != SETTINGS && this != SHUTTLE

    /** 헤더 T1|T2·상단 줄: 설정 탭에선 숨김 */
    val showsTerminal: Boolean get() = this != SETTINGS
}

/** 공통 프레임: 헤더(50) → 상단 줄(30) → 본문(좌우 16) → 하단 탭(80) */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RootScreen(model: AppViewModel) {
    val state by model.state.collectAsStateWithLifecycle()
    val theme = LocalTheme.current
    val tab = state.tab
    val lifecycle = LocalLifecycleOwner.current.lifecycle

    LaunchedEffect(lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            model.refresh()
            while (true) {
                delay(60_000)
                model.tick()
            }
        }
    }

    Scaffold(
        containerColor = theme.p.bg.toColor(),
        bottomBar = {
            NavigationBar(containerColor = theme.p.chip.toColor()) {
                AppTab.entries.forEach { item ->
                    NavigationBarItem(
                        selected = tab == item,
                        onClick = { model.setTab(item) },
                        icon = { Icon(painterResource(item.icon), contentDescription = null) },
                        label = { Text(item.label, style = style(12f, if (tab == item) FontWeight.Bold else FontWeight.SemiBold)) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = theme.p.ink.toColor(),
                            selectedTextColor = theme.p.ink.toColor(),
                            indicatorColor = theme.p.tonal.toColor(),
                            unselectedIconColor = theme.p.faint.toColor(),
                            unselectedTextColor = theme.p.faint.toColor(),
                        ),
                    )
                }
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(bottom = padding.calculateBottomPadding()).statusBarsPadding()) {
            Header(tab, state, model)
            if (tab.showsTerminal) MetaBar(tab, state, model)
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when {
                    tab == AppTab.SETTINGS -> SettingsScreen(state, model)
                    tab == AppTab.SHUTTLE -> ShuttleScreen(state, model)
                    state.phase == AppViewModel.Phase.NOT_CONFIGURED -> Message(Strings.Error.notConfigured)
                    state.phase == AppViewModel.Phase.LOADING -> LoadingSkeleton()
                    state.phase == AppViewModel.Phase.FAILED -> Message(Strings.Error.unavailable) { Button(onClick = { model.refresh(force = true) }) { Text(Strings.Error.retry) } }
                    tab == AppTab.LIVE -> LiveScreen(state, model)
                    tab == AppTab.FORECAST -> ForecastScreen(state, model)
                    tab == AppTab.HISTORY -> HistoryScreen(state, model)
                }
            }
        }
    }

    state.sheet?.let { target ->
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { model.openSheet(null) },
            sheetState = sheetState,
            shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
            containerColor = theme.p.sheet.toColor(),
            scrimColor = theme.p.scrim.toColor(),
        ) {
            SheetContent(target, state) { model.openSheet(null) }
        }
    }
}

@Composable
private fun Header(tab: AppTab, state: AppViewModel.UiState, model: AppViewModel) {
    val theme = LocalTheme.current
    Row(Modifier.fillMaxWidth().height(50.dp).padding(start = 18.dp, end = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(tab.title, style = styleS(20f, FontWeight.Bold, theme.p.ink.toColor()).copy(letterSpacing = fs(-0.5f)), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).semantics { heading() })
        if (tab.showsUnit) {
            Segmented(listOf(DisplayUnit.OCCUPANCY to Strings.Header.unitOccupancy, DisplayUnit.AVAILABLE to Strings.Header.unitAvailable), state.unit, model::setUnit)
        }
        if (tab.showsTerminal) {
            Segmented(listOf(Terminal.T1 to Strings.Header.terminal1, Terminal.T2 to Strings.Header.terminal2), state.terminal, model::setTerminal)
        }
    }
}

/** 상단 줄: "14:30 기준 · 2분 전" · 범례 · 새로고침. 지연·오프라인이면 warn 색 */
@Composable
private fun MetaBar(tab: AppTab, state: AppViewModel.UiState, model: AppViewModel) {
    val theme = LocalTheme.current
    val f = state.freshness
    val warn = tab != AppTab.SHUTTLE && f?.isWarning == true
    val color = if (warn) theme.p.warnInk.toColor() else theme.p.muted.toColor()
    val text = when {
        tab == AppTab.SHUTTLE -> Strings.Meta.shuttleNow(ShuttleText.hm(state.kst.secondsOfDay / 60))
        state.phase == AppViewModel.Phase.LOADING -> Strings.Meta.loading
        else -> f?.text.orEmpty()
    }
    val shape = RoundedCornerShape(9.dp)
    Row(
        Modifier
            .padding(start = 16.dp, end = 16.dp, bottom = 4.dp)
            .fillMaxWidth()
            .height(30.dp)
            .clip(shape)
            .then(if (warn) Modifier.background(theme.p.warnBg.toColor()).border(1.dp, theme.p.warnLine.toColor(), shape) else Modifier)
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(text, style = style(12.5f, FontWeight.SemiBold, color, tabular = true), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        if (tab != AppTab.SHUTTLE) {
            Box { androidx.compose.runtime.CompositionLocalProvider(androidx.compose.material3.LocalContentColor provides color) { LegendScale() } }
            Text(
                if (state.refreshing) Strings.Meta.refreshing else Strings.Meta.refresh,
                style = style(12.5f, FontWeight.SemiBold, color),
                modifier = Modifier.clickable { model.refresh(force = true) }.padding(start = 10.dp, top = 6.dp, bottom = 6.dp),
            )
        }
    }
}

/** 첫 로딩: 회색 스켈레톤 + 안내(디자인 5l) */
@Composable
private fun LoadingSkeleton() {
    val theme = LocalTheme.current
    val track = theme.p.track.toColor()
    Column(Modifier.fillMaxSize().padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 12.dp)) {
        Box(Modifier.padding(start = 4.dp, top = 2.dp, bottom = 10.dp).fillMaxWidth(0.6f).height(26.dp).clip(RoundedCornerShape(8.dp)).background(track))
        Box(Modifier.weight(1.1f).fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(track))
        Spacer(Modifier.height(8.dp))
        Box(Modifier.weight(1f).fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(track))
        Text(Strings.Loading.parking, style = style(13f, color = theme.p.muted.toColor()), modifier = Modifier.align(Alignment.CenterHorizontally).padding(top = 10.dp))
    }
}

@Composable
fun Message(text: String, action: (@Composable () -> Unit)? = null) {
    val theme = LocalTheme.current
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(text, style = style(14f, color = theme.p.muted.toColor()))
            action?.invoke()
        }
    }
}
