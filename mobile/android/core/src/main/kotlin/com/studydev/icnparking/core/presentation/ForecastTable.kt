package com.studydev.icnparking.core.presentation

import com.studydev.icnparking.core.forecast.CellSchedule
import com.studydev.icnparking.core.forecast.ForecastFailure
import com.studydev.icnparking.core.forecast.ForecastResult
import com.studydev.icnparking.core.forecast.forecast
import com.studydev.icnparking.core.generated.Strings
import com.studydev.icnparking.core.generated.Terminal
import com.studydev.icnparking.core.generated.Zones
import com.studydev.icnparking.core.settings.DisplayUnit
import com.studydev.icnparking.core.time.ParkingTime
import com.studydev.icnparking.core.time.SlotTime

/** 예측 표가 칸을 비우는 이유(디자인 5h 회색 칸) */
enum class ForecastRowReason(val text: String) {
    CLOSED(Strings.Forecast.reasonClosed),
    MISSING(Strings.Forecast.reasonMissing),
    CAPACITY_CHANGED(Strings.Forecast.reasonCapacityChanged),
    UNAVAILABLE(Strings.Forecast.reasonUnavailable),
    ;

    companion object {
        /** 지금 값과 예측 결과로 사유를 정한다(예측이 되면 null) */
        fun of(now: ZoneNow, result: ForecastResult?): ForecastRowReason? {
            if (now.closed) return CLOSED
            if (now.missing) return MISSING
            val failure = (result as? ForecastResult.Unavailable)?.failure ?: return if (result == null) UNAVAILABLE else null
            return when (failure) {
                ForecastFailure.RecentClosed, ForecastFailure.LatestClosed -> CLOSED
                ForecastFailure.NoCurrent, ForecastFailure.CapacityUnknown -> MISSING
                is ForecastFailure.CapacityChanged -> CAPACITY_CHANGED
                ForecastFailure.NoHistory -> UNAVAILABLE
            }
        }
    }
}

/** 지금 값 또는 예측 칸 하나(남은 대수·점유율) */
data class ValuePair(val available: Double, val occupancy: Double) {
    fun text(unit: DisplayUnit): String =
        if (unit == DisplayUnit.OCCUPANCY) NumberText.percent(occupancy) + Strings.Unit.percent else NumberText.plain(available)

    /** 지금보다 얼마나 변했는지(점유율 모드는 %p) */
    fun delta(from: ValuePair, unit: DisplayUnit): Int =
        if (unit == DisplayUnit.OCCUPANCY) NumberText.round(occupancy * 100) - NumberText.round(from.occupancy * 100)
        else NumberText.round(available) - NumberText.round(from.available)
}

data class ForecastRow(
    val id: String,
    val name: String,
    val target: SheetTarget,
    val isTotal: Boolean,
    /** 지금 값. 운영 중단·현재값 없음이면 null("—") */
    val now: ValuePair?,
    /** 6칸. reason이 있으면 빈 목록 */
    val cells: List<ValuePair>,
    val reason: ForecastRowReason?,
)

sealed interface ForecastTableItem {
    data class Label(val text: String) : ForecastTableItem
    data class Row(val row: ForecastRow) : ForecastTableItem
}

/** 예측 탭 표(디자인 5d/5f): 전체 → 단기 층 → 장기·타워 → 예약 */
class ForecastTable(snapshot: ParkingSnapshot, terminal: Terminal) {
    /** 6칸 시각(지금 + 30분씩) */
    val times: List<SlotTime> = CellSchedule.HALF_HOURLY.slotsAfter(snapshot.now.slot).map { ParkingTime.slotRange(snapshot.now.date, it) }
    val items: List<ForecastTableItem>

    init {
        val results = snapshot.forecasts(terminal)
        val layout = Zones.layout(terminal)
        val total = snapshot.group(SheetTarget.Total(terminal), results)
        val totalNow = if (total.available != null && total.occupancy != null) ValuePair(total.available!!.toDouble(), total.occupancy!!) else null
        val totalRow = ForecastRow(
            id = "total", name = Strings.Forecast.total, target = SheetTarget.Total(terminal), isTotal = true, now = totalNow,
            cells = total.cells.map { ValuePair(it.available, it.occupancy) },
            reason = when {
                total.included.isEmpty() -> ForecastRowReason.MISSING
                total.hasForecast -> null
                else -> ForecastRowReason.UNAVAILABLE
            },
        )

        fun zoneRow(id: String): ForecastTableItem {
            val now = snapshot.zoneNow(id)
            val result = results[id]
            val reason = ForecastRowReason.of(now, result)
            val nowPair = if (now.available != null && now.occupancy != null) ValuePair(now.available!!.toDouble(), now.occupancy!!) else null
            // 비교일 기록이 빈 칸은 지금 값으로(그룹 합계와 같은 규칙). reason이 없으면 nowPair도 있다
            val cells = if (reason != null) emptyList() else result?.forecast?.cells.orEmpty().mapNotNull { c ->
                val a = c.available
                val o = c.occupancy
                if (a != null && o != null) ValuePair(a, o) else nowPair
            }
            return ForecastTableItem.Row(ForecastRow(id, Zones.byId[id]?.shortName ?: id, SheetTarget.Zone(id), false, nowPair, cells, reason))
        }

        items = listOf(ForecastTableItem.Row(totalRow), ForecastTableItem.Label(Strings.Forecast.sectionShort)) +
            layout.floors.map(::zoneRow) + ForecastTableItem.Label(Strings.Forecast.sectionLong) +
            layout.long.map(::zoneRow) + zoneRow(layout.reserved)
    }
}
