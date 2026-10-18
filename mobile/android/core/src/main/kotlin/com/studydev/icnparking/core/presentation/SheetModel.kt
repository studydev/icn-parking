package com.studydev.icnparking.core.presentation

import com.studydev.icnparking.core.forecast.CellSchedule
import com.studydev.icnparking.core.forecast.ForecastFailure
import com.studydev.icnparking.core.forecast.ForecastResult
import com.studydev.icnparking.core.forecast.forecast
import com.studydev.icnparking.core.generated.Strings
import com.studydev.icnparking.core.generated.Terminal
import com.studydev.icnparking.core.generated.TerminalLayout
import com.studydev.icnparking.core.generated.ZoneGroup
import com.studydev.icnparking.core.generated.ZoneCategory
import com.studydev.icnparking.core.generated.Zones
import com.studydev.icnparking.core.time.LocalDates
import com.studydev.icnparking.core.time.ParkingTime
import com.studydev.icnparking.core.time.SlotTime
import kotlin.math.abs
import kotlin.math.max

/** 그래프 점(x = 지금 슬롯 기준 5분 칸 차이, y = 남은 대수) */
data class SeriesPoint(val offset: Int, val available: Double)

/** 그래프 아래 시각 눈금 */
data class AxisLabel(val offset: Int, val label: String, val isNow: Boolean)

/** 시간대별 표의 열(선택한 곳이 맨 앞) */
data class TimelineColumn(val target: SheetTarget, val name: String, val selected: Boolean)

/** 시간대별 표의 행: 지금 + 30분씩 12칸. 값이 없으면 null(운영 중단·현재값 없음·예측 불가) */
data class TimelineRow(val time: SlotTime, val isNow: Boolean, val values: List<ValuePair?>)

/** 셔틀 정차 순서처럼 세로로 읽는 시간대별 예상(선택 주차장 + 같은 단기/장기 묶음의 다른 주차장) */
data class SheetTimeline(val columns: List<TimelineColumn>, val rows: List<TimelineRow>)

/** 묶음의 구역 id(화면 순서): 단기 = 위층부터, 장기·타워 = 예측 표 순서, 예약 = 하나 */
fun TerminalLayout.ids(group: ZoneGroup): List<String> = when (group) {
    ZoneGroup.SHORT -> floors
    ZoneGroup.LONG -> long
    ZoneGroup.RESERVED -> listOf(reserved)
}

val SheetTarget.terminal: Terminal
    get() = when (this) {
        is SheetTarget.Zone -> Zones.byId[id]?.terminal ?: Terminal.T1
        is SheetTarget.Group -> terminal
        is SheetTarget.Total -> terminal
    }

/** 상세 시트: 구역·그룹·터미널 전체. 그래프는 지난 2시간 실측 + 6시간 예상(30분 점마다 숫자). iOS SheetModel과 같은 계산 */
class SheetModel private constructor(
    val kicker: String,
    val name: String,
    val available: Int?,
    val capacity: Int,
    val occupancy: Double?,
    /** 지난 2시간 실측(30분 점, 보정값 포함 — README: 그래프에는 그린다) */
    val actual: List<SeriesPoint>,
    /** 지금 + 6시간 예상(30분 점). 예측이 없으면 빈 목록 */
    val forecast: List<SeriesPoint>,
    /** 비교 주 같은 시각(30분 점, −2시간 … +6시간) */
    val base: List<SeriesPoint>,
    val axis: List<AxisLabel>,
    val explain: String,
    val timeline: SheetTimeline,
    /** 시트 맨 아래. 상단 줄 문구를 받아 붙인다 */
    val footer: (String) -> String,
) {
    val nowPair: ValuePair? get() = if (available != null && occupancy != null) ValuePair(available.toDouble(), occupancy) else null

    companion object {
        /** 지난 2시간 · 앞으로 6시간(5분 칸 단위 차이) */
        val pastOffsets = (-24..0 step 6).toList()
        val allOffsets = (-24..72 step 6).toList()

        fun of(s: ParkingSnapshot, target: SheetTarget): SheetModel {
            val engine = s.engine
            val terminal = target.terminal
            // 터미널 모든 구역의 30분 칸 예측(시간대별 표의 다른 주차장 열에도 쓴다)
            val results = s.forecasts(terminal)
            val axis = (-24..72 step 12).map {
                AxisLabel(it, if (it == 0) Strings.Sheet.nowMarker(s.now.label) else ParkingTime.slotRange(s.now.date, s.now.slot + it).label, it == 0)
            }
            val timeline = timeline(s, target, results)

            /** 날짜 파일의 남은 대수(보정값 포함) */
            fun dayAvailable(id: String, offset: Int): Double? {
                val at = ParkingTime.slotRange(s.now.date, s.now.slot + offset)
                val z = s.days[at.date]?.zones?.get(id) ?: return null
                val p = z.p.getOrNull(at.slot) ?: return null
                val c = z.c.getOrNull(at.slot) ?: return null
                return if (c > 0) max(c - p, 0).toDouble() else null
            }

            /** 구역의 비교 주 같은 시각 남은 대수(예측이 없으면 null) */
            fun baseAvailable(id: String, offset: Int): Double? {
                val f = results[id]?.forecast ?: return null
                val at = ParkingTime.slotRange(f.compareDate, s.now.slot + offset)
                return engine.smoothed(id, at.date, at.slot)?.let { max(f.current.capacity - it, 0.0) }
            }

            fun build(kicker: String, name: String, available: Int?, capacity: Int, occupancy: Double?, actual: List<SeriesPoint>, forecast: List<SeriesPoint>,
                      base: List<SeriesPoint>, explain: String, footer: (String) -> String) =
                SheetModel(kicker, name, available, capacity, occupancy, actual, forecast, base, axis, explain, timeline, footer)

            if (target is SheetTarget.Zone) {
                val id = target.id
                val zone = Zones.byId[id]
                val zn = s.zoneNow(id)
                val result = results[id]
                val kicker = if (zone?.category == ZoneCategory.TOWER) Strings.Sheet.kickerTower(terminal.code) else Strings.Sheet.kickerZone(terminal.code, zone?.category?.label.orEmpty())
                val actual = pastOffsets.mapNotNull { o -> dayAvailable(id, o)?.let { SeriesPoint(o, it) } }
                val capacity = zn.capacity ?: result?.forecast?.current?.capacity ?: 0
                val f = result?.forecast
                val now = zn.available
                if (f == null || now == null) {
                    return build(kicker, zone?.name ?: id, zn.available, capacity, zn.occupancy, actual, emptyList(), emptyList(), why(result, zn)) { Strings.Sheet.footerGroup(it) }
                }
                val weeksAgo = if (f.weeksBack == 1) Strings.Sheet.lastWeek else Strings.Sheet.weeksAgo(f.weeksBack.toString())
                // 지금 차이 = 남은 대수 기준(지금 − 그때). 그래프와 같은 단위
                val diff = NumberText.round(f.baseParking - f.current.parking)
                val explain = Strings.Sheet.explain(weeksAgo, Strings.Weekday.long[LocalDates.weekday(f.compareDate)], NumberText.monthDay(f.compareDate),
                    (if (diff >= 0) "+" else "−") + NumberText.grouped(abs(diff)))
                val weekday = Strings.Weekday.short[LocalDates.weekday(f.compareDate)]
                return build(
                    kicker, zone?.name ?: id, now, capacity, zn.occupancy, actual,
                    listOf(SeriesPoint(0, now.toDouble())) + f.cells.mapIndexedNotNull { k, c -> c.available?.let { SeriesPoint(6 * (k + 1), it) } },
                    allOffsets.mapNotNull { o -> baseAvailable(id, o)?.let { SeriesPoint(o, it) } },
                    explain,
                ) { Strings.Sheet.footer(it, f.compareDate, weekday) }
            }

            val name = when (target) {
                is SheetTarget.Group -> Strings.Sheet.groupName(target.group.label)
                is SheetTarget.Total -> Strings.Forecast.totalA11y(target.terminal.code)
                is SheetTarget.Zone -> error("위에서 처리")
            }
            val g = s.group(target, results)
            val actual = pastOffsets.mapNotNull { o ->
                val values = g.included.mapNotNull { dayAvailable(it, o) }
                if (values.isEmpty() || values.size < g.included.size) null else SeriesPoint(o, values.sum())
            }
            val footer: (String) -> String = { Strings.Sheet.footerGroup(it) + Strings.Sheet.footerGroupSuffix }
            val kicker = Strings.Sheet.kickerGroup(terminal.code)
            val now = g.available
            if (!g.hasForecast || now == null) {
                return build(kicker, name, g.available, g.capacity, g.occupancy, actual, emptyList(), emptyList(), Strings.Forecast.whyNoHistory, footer)
            }
            // 비교 주 선: 예측 있는 구역은 각자 비교 주, 없는 구역은 지금 값(그룹 예측과 같은 규칙)
            val base = allOffsets.mapNotNull { o ->
                var sum = 0.0
                for (id in g.included) {
                    if (results[id]?.forecast != null) sum += baseAvailable(id, o) ?: return@mapNotNull null
                    else s.zoneNow(id).available?.let { sum += it }
                }
                SeriesPoint(o, sum)
            }
            return build(
                kicker, name, now, g.capacity, g.occupancy, actual,
                listOf(SeriesPoint(0, now.toDouble())) + g.cells.mapIndexed { k, c -> SeriesPoint(6 * (k + 1), c.available) },
                base, Strings.Sheet.explainGroup, footer,
            )
        }

        /** 열: 구역 → 그 구역 + 같은 묶음 다른 구역, 그룹 → 그룹 전체 + 소속 구역, 터미널 전체 → 전체 + 단기 + 장기 */
        private fun timeline(s: ParkingSnapshot, target: SheetTarget, results: Map<String, ForecastResult>): SheetTimeline {
            val layout = Zones.layout(target.terminal)
            fun zoneColumn(id: String, selected: Boolean) = TimelineColumn(SheetTarget.Zone(id), Zones.byId[id]?.shortName ?: id, selected)
            val columns = when (target) {
                is SheetTarget.Zone -> {
                    val ids = layout.ids(Zones.byId[target.id]?.category?.group ?: ZoneGroup.SHORT)
                    (listOf(target.id) + ids.filter { it != target.id }).map { zoneColumn(it, it == target.id) }
                }
                is SheetTarget.Group -> listOf(TimelineColumn(target, Strings.Widget.total, true)) + layout.ids(target.group).map { zoneColumn(it, false) }
                is SheetTarget.Total -> listOf(
                    TimelineColumn(target, Strings.Widget.total, true),
                    TimelineColumn(SheetTarget.Group(target.terminal, ZoneGroup.SHORT), Strings.History.groupShort, false),
                    TimelineColumn(SheetTarget.Group(target.terminal, ZoneGroup.LONG), Strings.History.groupLong, false),
                )
            }
            // 열마다 지금 값 + 12칸 예상
            val series = columns.map { column ->
                val (now, _, cells) = WidgetModels.series(s, column.target, results)
                listOf(now) + cells
            }
            val times = listOf(s.now) + CellSchedule.HALF_HOURLY.slotsAfter(s.now.slot).map { ParkingTime.slotRange(s.now.date, it) }
            val rows = times.mapIndexed { k, time -> TimelineRow(time, k == 0, series.map { it.getOrNull(k) }) }
            return SheetTimeline(columns, rows)
        }

        /** 예측이 없을 때 설명(디자인 5g/5i why) */
        fun why(result: ForecastResult?, now: ZoneNow): String {
            if (now.closed) return Strings.Forecast.whyClosed
            if (now.missing) return Strings.Forecast.whyMissing
            val failure = (result as? ForecastResult.Unavailable)?.failure ?: return Strings.Forecast.whyNoHistory
            return when (failure) {
                ForecastFailure.RecentClosed, ForecastFailure.LatestClosed -> Strings.Forecast.whyClosed
                ForecastFailure.NoCurrent -> Strings.Forecast.whyMissing
                ForecastFailure.CapacityUnknown -> Strings.Forecast.whyCapacityUnknown
                is ForecastFailure.CapacityChanged -> Strings.Forecast.whyCapacityChanged(NumberText.grouped(failure.from), NumberText.grouped(failure.to))
                ForecastFailure.NoHistory -> Strings.Forecast.whyNoHistory
            }
        }
    }
}
