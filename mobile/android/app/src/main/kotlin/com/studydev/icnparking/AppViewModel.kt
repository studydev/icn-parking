package com.studydev.icnparking

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.studydev.icnparking.core.ParkingServices
import com.studydev.icnparking.core.data.DataClient
import com.studydev.icnparking.core.data.DataOrigin
import com.studydev.icnparking.core.data.Loaded
import com.studydev.icnparking.core.forecast.Freshness
import com.studydev.icnparking.core.generated.Terminal
import com.studydev.icnparking.core.generated.ZoneGroup
import com.studydev.icnparking.core.generated.Zones
import com.studydev.icnparking.core.presentation.DeepLink
import com.studydev.icnparking.core.model.CalendarDoc
import com.studydev.icnparking.core.model.DayDoc
import com.studydev.icnparking.core.model.LatestDoc
import com.studydev.icnparking.core.model.ParkingJson
import com.studydev.icnparking.core.presentation.HistoryModel
import com.studydev.icnparking.core.presentation.ParkingSnapshot
import com.studydev.icnparking.core.presentation.SheetTarget
import com.studydev.icnparking.core.settings.AppSettings
import com.studydev.icnparking.core.settings.DisplayUnit
import com.studydev.icnparking.core.settings.SettingsStore
import com.studydev.icnparking.core.shuttle.ShuttleDoc
import com.studydev.icnparking.core.shuttle.ShuttleSchedule
import com.studydev.icnparking.core.time.ParkingTime
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant

/** 앱 전체 상태(README State, iOS AppModel과 같은 구조). 화면은 state만 읽는다. */
class AppViewModel(
    private val client: DataClient?,
    private val settingsStore: SettingsStore?,
    val shuttle: ShuttleSchedule?,
) : ViewModel() {
    enum class Phase {
        /** 빌드에 데이터 주소가 없음(local.properties icn.dataBaseUrl) */
        NOT_CONFIGURED,
        LOADING,
        LOADED,

        /** 네트워크도 저장본도 없음 */
        FAILED,
    }

    data class UiState(
        val phase: Phase,
        val latest: Loaded<LatestDoc>? = null,
        val calendar: CalendarDoc? = null,
        val days: Map<String, DayDoc> = emptyMap(),
        val refreshing: Boolean = false,
        val loadingHistory: Boolean = false,
        /** 상단 줄 "N분 전"·예측 기준 시각. 새로고침·주기 갱신 때 바뀐다 */
        val now: Instant = Instant.now(),
        val terminal: Terminal = Terminal.T1,
        val sheet: SheetTarget? = null,
        val historyDays: Int = 7,
        val historyGroup: ZoneGroup = ZoneGroup.SHORT,
        val historyFocus: String = HistoryModel.ALL_ID,
        val settings: AppSettings = AppSettings(),
        val tab: AppTab = AppTab.LIVE,
    ) {
        val kst: ParkingTime.Kst get() = ParkingTime.kst(now)
        val unit: DisplayUnit get() = settings.unit
        val freshness: Freshness?
            get() = latest?.let { Freshness.of(it.value.slot, it.value.stale ?: false, now, it.origin == DataOrigin.OFFLINE) }
        val snapshot: ParkingSnapshot?
            get() = latest?.let { ParkingSnapshot(it.value, days, calendar?.holidays.orEmpty(), kst.slotTime) }
    }

    private val _state = MutableStateFlow(UiState(if (client == null) Phase.NOT_CONFIGURED else Phase.LOADING))
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        settingsStore?.let { store ->
            viewModelScope.launch {
                var first = true
                store.settings.collect { s ->
                    _state.update { it.copy(settings = s, terminal = if (first) s.defaultTerminal else it.terminal) }
                    first = false
                }
            }
        }
    }

    fun refresh(force: Boolean = false) {
        val client = client ?: return
        if (_state.value.refreshing) return
        _state.update { it.copy(refreshing = true) }
        viewModelScope.launch {
            val result = runCatching { client.latest(force) }
            _state.update { s ->
                result.fold(
                    onSuccess = { s.copy(phase = Phase.LOADED, latest = it, now = Instant.now()) },
                    onFailure = { s.copy(phase = if (s.latest == null) Phase.FAILED else s.phase, now = Instant.now()) },
                )
            }
            val calendar = runCatching { client.calendar(force).value }.getOrNull()
            val days = client.days(ParkingSnapshot.forecastDates(_state.value.kst.date))
            _state.update { s -> s.copy(calendar = calendar ?: s.calendar, days = s.days + days, refreshing = false) }
        }
    }

    /** 히스토리 기간의 날짜 파일(지난 날짜는 확정 후 디스크 캐시라 처음 한 번만 받는다) */
    fun loadHistory() {
        val client = client ?: return
        _state.update { it.copy(loadingHistory = true) }
        viewModelScope.launch {
            val s = _state.value
            val days = client.days(HistoryModel.requiredDates(s.kst.date, s.historyDays))
            _state.update { it.copy(days = it.days + days, loadingHistory = false) }
        }
    }

    /** 1분마다 시각을 갱신하고 다시 확인한다(60초 캐시라 실제 요청은 최대 분당 1회) */
    fun tick() {
        touchClock()
        refresh()
    }

    /** 셔틀 탭은 15초마다 시각만 바꾼다 */
    fun touchClock() = _state.update { it.copy(now = Instant.now()) }

    fun setTerminal(t: Terminal) = _state.update { it.copy(terminal = t) }
    fun setTab(tab: AppTab) = _state.update { it.copy(tab = tab) }

    /** icnparking:// 딥링크를 상태에 반영(iOS AppModel.open과 같은 규칙) */
    fun open(link: DeepLink) {
        link.screenTerminal?.let { t -> _state.update { it.copy(terminal = t) } }
        when (link) {
            is DeepLink.Zone, is DeepLink.Group, is DeepLink.Total -> _state.update { it.copy(tab = AppTab.LIVE, sheet = link.sheetTarget) }
            is DeepLink.Forecast -> _state.update { it.copy(tab = AppTab.FORECAST, sheet = null) }
            is DeepLink.Shuttle -> {
                _state.update { it.copy(tab = AppTab.SHUTTLE, sheet = null) }
                selectShuttle(link.route, link.stop)
            }
        }
    }

    /** 지금 터미널 노선 순서에 없으면 그 노선이 있는 터미널로. 승강장은 노선에 있을 때만 */
    private fun selectShuttle(route: String, stop: String?) {
        val r = shuttle?.route(route) ?: return
        if (route !in Zones.layout(_state.value.terminal).shuttleRoutes) {
            Terminal.entries.firstOrNull { route in Zones.layout(it).shuttleRoutes }?.let { t -> _state.update { it.copy(terminal = t) } }
        }
        val terminal = _state.value.terminal
        save {
            setShuttleRoute(terminal, route)
            if (stop != null && r.stops.any { it.stop.id == stop }) setShuttleStop(route, stop)
        }
    }
    fun openSheet(target: SheetTarget?) = _state.update { it.copy(sheet = target) }
    fun setHistoryDays(n: Int) { _state.update { it.copy(historyDays = n) }; loadHistory() }
    fun setHistoryGroup(g: ZoneGroup) = _state.update { it.copy(historyGroup = g, historyFocus = HistoryModel.ALL_ID) }
    fun setHistoryFocus(id: String) = _state.update { it.copy(historyFocus = id) }

    private fun save(block: suspend SettingsStore.() -> Unit) {
        val store = settingsStore ?: return
        viewModelScope.launch { store.block() }
    }

    fun setUnit(unit: DisplayUnit) = save { setUnit(unit) }
    fun setDefaultTerminal(t: Terminal) = save { setDefaultTerminal(t) }
    fun setShowDelta(show: Boolean) = save { setShowDelta(show) }
    fun setShuttleRoute(route: String) = save { setShuttleRoute(_state.value.terminal, route) }
    fun setShuttleStop(route: String, stop: String) = save { setShuttleStop(route, stop) }

    companion object {
        fun create(context: Context): AppViewModel {
            val services = ParkingServices.get()
            return AppViewModel(services.client, services.settings, bundledShuttle(context))
        }

        fun bundledShuttle(context: Context): ShuttleSchedule? = runCatching {
            val text = context.assets.open("shuttle.json").use { it.readBytes().decodeToString() }
            ShuttleSchedule(ParkingJson.decodeFromString(ShuttleDoc.serializer(), text))
        }.getOrNull()
    }
}
