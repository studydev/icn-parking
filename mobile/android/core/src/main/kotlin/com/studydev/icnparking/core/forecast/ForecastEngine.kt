package com.studydev.icnparking.core.forecast

import com.studydev.icnparking.core.model.DayDoc
import com.studydev.icnparking.core.model.DayZone
import com.studydev.icnparking.core.model.LatestZone
import com.studydev.icnparking.core.time.LocalDates
import com.studydev.icnparking.core.time.ParkingTime
import com.studydev.icnparking.core.time.SlotTime
import kotlin.math.max
import kotlin.math.min

/** 예측 칸 위치. 칸 하나의 계산은 웹 forecastOf와 같고 위치만 다르다. */
enum class CellSchedule {
    /** 앱: 지금 슬롯 + 30분씩 6칸(+30분 … +3시간) */
    HALF_HOURLY,

    /** 웹 forecastOf: 다음 정시부터 1시간씩 6칸 */
    WEB_HOURLY;

    fun slotsAfter(idx: Int): List<Int> = when (this) {
        HALF_HOURLY -> (1..6).map { idx + 6 * it }
        WEB_HOURLY -> (0 until 6).map { (idx / 12 + 1 + it) * 12 }
    }
}

/** 예측을 만들 수 없는 이유. 웹 forecastOf·capacityPredictionIssue의 실패 문구와 1:1 */
sealed interface ForecastFailure {
    /** 기준점을 찾는 동안 면수 0 관측 — "최근 관측이 운영 중단 상태입니다." */
    data object RecentClosed : ForecastFailure

    /** latest 면수 0 — "현재 운영 중단 구역입니다." */
    data object LatestClosed : ForecastFailure

    /** latest 면수 없음 — "현재 운영 면수를 확인할 수 없어 …" */
    data object CapacityUnknown : ForecastFailure

    /** latest 면수 ≠ 기준점 면수 — "최신 면수와 예측 기준 면수가 달라 …" */
    data class CapacityChanged(val from: Int, val to: Int) : ForecastFailure

    /** 최근 30분 실측 없음 — "지금 값이 없어 추정할 수 없습니다" */
    data object NoCurrent : ForecastFailure

    /** 1~4주 전 같은 요일·시각 기록 없음 */
    data object NoHistory : ForecastFailure
}

/** 기준점(지금 또는 최대 30분 전 실측) */
data class CurrentValue(val anchor: SlotTime, val capacity: Int, val parking: Int) {
    val available: Int get() = max(capacity - parking, 0)
    val occupancy: Double get() = min(parking.toDouble() / capacity, 1.0)
}

data class ForecastCell(
    /** 예측 시각(오늘 기준, 자정을 넘으면 다음 날) */
    val time: SlotTime,
    /** 예상 주차 대수. 비교일 기록이 없으면 null */
    val parking: Double?,
    /** 비교일 같은 시각 주차 대수(±2슬롯 실측 평균) */
    val baseParking: Double?,
    val capacity: Int,
) {
    val available: Double? get() = parking?.let { max(capacity - it, 0.0) }
    val occupancy: Double? get() = parking?.let { min(it / capacity, 1.0) }
}

data class ZoneForecast(
    val current: CurrentValue,
    /** 1~4: 몇 주 전 같은 요일을 썼는지 */
    val weeksBack: Int,
    val compareDate: String,
    val baseParking: Double,
    /** 지금 대수 − 비교일 같은 시각 대수 */
    val offset: Double,
    val cells: List<ForecastCell>,
)

sealed interface ForecastResult {
    data class Available(val forecast: ZoneForecast) : ForecastResult
    data class Unavailable(val failure: ForecastFailure, val current: CurrentValue?) : ForecastResult
}

val ForecastResult.forecast: ZoneForecast? get() = (this as? ForecastResult.Available)?.forecast

/** web/app.js forecastOf 이식. 1~4주 전 같은 요일·시각 주차 대수(±2슬롯 실측 평균)에 "지금 − 그때" 차이를 더하고 현재 운영 면수로 환산한다. */
class ForecastEngine(
    val days: Map<String, DayDoc>,
    val latest: List<LatestZone>,
    /** 지금 KST 날짜·슬롯 */
    val now: SlotTime,
) {
    fun zone(zoneId: String, schedule: CellSchedule = CellSchedule.HALF_HOURLY): ForecastResult {
        var anchorTime: SlotTime? = null
        var anchorZone: DayZone? = null
        for (back in 0..6) {
            val at = ParkingTime.slotRange(now.date, now.slot - back)
            val z = dayZone(at.date, zoneId)
            if (z != null && value(z.c, at.slot) == 0) return ForecastResult.Unavailable(ForecastFailure.RecentClosed, null)
            if (z != null && measured(z, at.slot) != null) { anchorTime = at; anchorZone = z; break }
        }
        val capacity = anchorZone?.let { value(it.c, anchorTime!!.slot) }
        val parking = anchorZone?.let { parking(it, anchorTime!!.slot) }
        if (anchorTime == null || capacity == null || parking == null) return ForecastResult.Unavailable(ForecastFailure.NoCurrent, null)
        capacityIssue(zoneId, capacity)?.let { return ForecastResult.Unavailable(it, null) }
        val current = CurrentValue(anchorTime, capacity, parking)

        for (w in 1..4) {
            val compareDate = LocalDates.addDays(now.date, -7 * w)
            val baseParking = smoothed(zoneId, LocalDates.addDays(anchorTime.date, -7 * w), anchorTime.slot) ?: continue
            val offset = parking.toDouble() - baseParking
            val cells = schedule.slotsAfter(now.slot).map { j ->
                val at = ParkingTime.slotRange(compareDate, j)
                val bv = smoothed(zoneId, at.date, at.slot)
                ForecastCell(ParkingTime.slotRange(now.date, j), bv?.let { max(it + offset, 0.0) }, bv, capacity)
            }
            if (cells.all { it.parking == null }) continue
            return ForecastResult.Available(ZoneForecast(current, w, compareDate, baseParking, offset, cells))
        }
        return ForecastResult.Unavailable(ForecastFailure.NoHistory, current)
    }

    /** web capacityPredictionIssue */
    internal fun capacityIssue(zoneId: String, capacity: Int): ForecastFailure? {
        val current = latest.firstOrNull { it.id == zoneId }?.c
        return when {
            current == 0 -> ForecastFailure.LatestClosed
            current == null || current <= 0 -> ForecastFailure.CapacityUnknown
            current != capacity -> ForecastFailure.CapacityChanged(from = capacity, to = current)
            else -> null
        }
    }

    /** web forecastOf sm: 지금 이전의 ±2슬롯 실측 평균 */
    internal fun smoothed(zoneId: String, date: String, slot: Int): Double? {
        var sum = 0.0
        var n = 0
        for (delta in -2..2) {
            val at = ParkingTime.slotRange(date, slot + delta)
            if (!(at.date < now.date || (at.date == now.date && at.slot <= now.slot))) continue
            val v = dayZone(at.date, zoneId)?.let { measured(it, at.slot) } ?: continue
            sum += v
            n++
        }
        return if (n > 0) sum / n else null
    }

    private fun dayZone(date: String, zoneId: String): DayZone? = days[date]?.zones?.get(zoneId)

    private fun value(list: List<Int?>, i: Int): Int? = list.getOrNull(i)

    /** web zoneDay p: 주차 대수와 면수(>0)가 모두 있을 때만 */
    private fun parking(z: DayZone, i: Int): Int? {
        val p = value(z.p, i) ?: return null
        val c = value(z.c, i) ?: return null
        return if (c > 0) p else null
    }

    /** web zoneDay pm: 보정 슬롯(e) 제외한 실측 */
    private fun measured(z: DayZone, i: Int): Int? = if (z.e?.contains(i) == true) null else parking(z, i)
}
