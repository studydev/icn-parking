package com.studydev.icnparking.core.presentation

import com.studydev.icnparking.core.forecast.CellSchedule
import com.studydev.icnparking.core.forecast.ForecastFailure
import com.studydev.icnparking.core.forecast.ForecastResult
import com.studydev.icnparking.core.forecast.forecast
import com.studydev.icnparking.core.generated.Strings
import com.studydev.icnparking.core.generated.ZoneCategory
import com.studydev.icnparking.core.generated.Zones
import com.studydev.icnparking.core.time.LocalDates
import com.studydev.icnparking.core.time.ParkingTime
import com.studydev.icnparking.core.time.SlotTime
import kotlin.math.abs
import kotlin.math.max

/** 그래프 점(x = 지금 슬롯 기준 5분 칸 차이, y = 남은 대수) */
data class SeriesPoint(val offset: Int, val available: Double)

data class SheetCell(val time: SlotTime, val value: ValuePair)

/** 상세 시트(디자인 5i): 구역·그룹·터미널 전체. iOS SheetModel과 같은 계산 */
class SheetModel private constructor(
    val kicker: String,
    val name: String,
    val available: Int?,
    val capacity: Int,
    val occupancy: Double?,
    /** 지난 3시간 실측(5분 칸, 보정값 포함 — README: 그래프에는 그린다) */
    val actual: List<SeriesPoint>,
    /** 지금 + 3시간 예상(30분 칸). 예측이 없으면 빈 목록 */
    val forecast: List<SeriesPoint>,
    /** 비교 주 같은 시각(30분 칸, −3시간 … +3시간) */
    val base: List<SeriesPoint>,
    val explain: String,
    val cells: List<SheetCell>,
    /** 시트 맨 아래. 상단 줄 문구를 받아 붙인다 */
    val footer: (String) -> String,
    val startLabel: String,
    val nowLabel: String,
    val endLabel: String,
) {
    val nowPair: ValuePair? get() = if (available != null && occupancy != null) ValuePair(available.toDouble(), occupancy) else null

    companion object {
        private val baseOffsets = (-36..36 step 6).toList()

        fun of(s: ParkingSnapshot, target: SheetTarget): SheetModel {
            val engine = s.engine
            val ids = s.zoneIds(target)
            val results = ids.associateWith { engine.zone(it) }
            val labels = Triple(ParkingTime.slotRange(s.now.date, s.now.slot - 36).label, s.now.label, ParkingTime.slotRange(s.now.date, s.now.slot + 36).label)

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
                      base: List<SeriesPoint>, explain: String, cells: List<SheetCell>, footer: (String) -> String) =
                SheetModel(kicker, name, available, capacity, occupancy, actual, forecast, base, explain, cells, footer, labels.first, labels.second, labels.third)

            if (target is SheetTarget.Zone) {
                val id = target.id
                val zone = Zones.byId[id]
                val zn = s.zoneNow(id)
                val result = results[id]
                val terminal = zone?.terminal?.code.orEmpty()
                val kicker = if (zone?.category == ZoneCategory.TOWER) Strings.Sheet.kickerTower(terminal) else Strings.Sheet.kickerZone(terminal, zone?.category?.label.orEmpty())
                val actual = (-36..0).mapNotNull { o -> dayAvailable(id, o)?.let { SeriesPoint(o, it) } }
                val capacity = zn.capacity ?: result?.forecast?.current?.capacity ?: 0
                val f = result?.forecast
                val now = zn.available
                if (f == null || now == null) {
                    return build(kicker, zone?.name ?: id, zn.available, capacity, zn.occupancy, actual, emptyList(), emptyList(), why(result, zn), emptyList()) { Strings.Sheet.footerGroup(it) }
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
                    baseOffsets.mapNotNull { o -> baseAvailable(id, o)?.let { SeriesPoint(o, it) } },
                    explain,
                    f.cells.mapNotNull { c -> if (c.available != null && c.occupancy != null) SheetCell(c.time, ValuePair(c.available!!, c.occupancy!!)) else null },
                ) { Strings.Sheet.footer(it, f.compareDate, weekday) }
            }

            val (terminal, name) = when (target) {
                is SheetTarget.Group -> target.terminal to Strings.Sheet.groupName(target.group.label)
                is SheetTarget.Total -> target.terminal to Strings.Forecast.totalA11y(target.terminal.code)
                is SheetTarget.Zone -> error("위에서 처리")
            }
            val g = s.group(target, results)
            val actual = (-36..0).mapNotNull { o ->
                val values = g.included.mapNotNull { dayAvailable(it, o) }
                if (values.isEmpty() || values.size < g.included.size) null else SeriesPoint(o, values.sum())
            }
            val footer: (String) -> String = { Strings.Sheet.footerGroup(it) + Strings.Sheet.footerGroupSuffix }
            val kicker = Strings.Sheet.kickerGroup(terminal.code)
            val now = g.available
            if (!g.hasForecast || now == null) {
                return build(kicker, name, g.available, g.capacity, g.occupancy, actual, emptyList(), emptyList(), Strings.Forecast.whyNoHistory, emptyList(), footer)
            }
            // 비교 주 선: 예측 있는 구역은 각자 비교 주, 없는 구역은 지금 값(그룹 예측과 같은 규칙)
            val base = baseOffsets.mapNotNull { o ->
                var sum = 0.0
                for (id in g.included) {
                    if (results[id]?.forecast != null) sum += baseAvailable(id, o) ?: return@mapNotNull null
                    else s.zoneNow(id).available?.let { sum += it }
                }
                SeriesPoint(o, sum)
            }
            val times = CellSchedule.HALF_HOURLY.slotsAfter(s.now.slot).map { ParkingTime.slotRange(s.now.date, it) }
            return build(
                kicker, name, now, g.capacity, g.occupancy, actual,
                listOf(SeriesPoint(0, now.toDouble())) + g.cells.mapIndexed { k, c -> SeriesPoint(6 * (k + 1), c.available) },
                base, Strings.Sheet.explainGroup,
                times.zip(g.cells).map { (t, c) -> SheetCell(t, ValuePair(c.available, c.occupancy)) },
                footer,
            )
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
