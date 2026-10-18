package com.studydev.icnparking.core.forecast

import com.studydev.icnparking.core.model.LatestZone
import com.studydev.icnparking.core.time.ParkingTime
import java.time.Instant
import kotlin.math.min

data class GroupCell(val available: Double, val occupancy: Double)

/** 그룹·터미널 합계. 지금 값은 web nowAgg(100% 상한)와 같다. */
data class GroupForecast(
    /** 합계에 들어간 구역(현재값 있고 면수 > 0) */
    val included: List<String>,
    /** 운영 중단·현재값 없음으로 빠진 구역 수 */
    val missing: Int,
    val capacity: Int,
    /** Σc − Σmin(p, c). 포함 구역이 없으면 null */
    val available: Int?,
    /** Σmin(p, c) / Σc */
    val occupancy: Double?,
    /** 포함 구역 중 하나라도 예측이 되면 true */
    val hasForecast: Boolean,
    /** 예측 없는 구역·빈 칸은 현재값을 그대로 더한다(디자인 groupSeries 규칙). hasForecast가 false면 빈 목록 */
    val cells: List<GroupCell>,
) {
    companion object {
        /** zoneIds 순서대로 합산한다. results는 같은 칸 위치로 계산한 구역 예측 */
        fun of(zoneIds: List<String>, latest: List<LatestZone>, results: Map<String, ForecastResult>): GroupForecast {
            var q = 0
            var c = 0
            val included = mutableListOf<String>()
            val current = mutableMapOf<String, Pair<Int, Int>>()
            for (id in zoneIds) {
                val x = latest.firstOrNull { it.id == id } ?: continue
                val p = x.p ?: continue
                val cap = x.c ?: continue
                if (cap == 0) continue
                q += min(p, cap)
                c += cap
                included += id
                current[id] = p to cap
            }
            val hasForecast = included.any { results[it]?.forecast != null }
            val cells = if (!hasForecast) emptyList() else (0 until 6).map { k ->
                var sum = 0.0
                for (id in included) {
                    val a = results[id]?.forecast?.cells?.get(k)?.available
                    if (a != null) sum += a else current[id]?.let { (p, cap) -> sum += (cap - min(p, cap)).toDouble() }
                }
                GroupCell(sum, (c - sum) / c)
            }
            return GroupForecast(
                included = included,
                missing = zoneIds.size - included.size,
                capacity = c,
                available = if (included.isEmpty()) null else c - q,
                occupancy = if (included.isEmpty()) null else q.toDouble() / c,
                hasForecast = hasForecast,
                cells = cells,
            )
        }
    }
}

/** 상단 줄 상태(README States): 오프라인 > 지연(stale 또는 slot이 10분 이상 지남) > 정상 */
sealed interface Freshness {
    /** "14:30 기준 · 2분 전"(0분 = 방금) */
    data class Normal(val time: String, val minutes: Int) : Freshness

    /** "수집 18분 지연 · 14:12 기준" */
    data class Delayed(val time: String, val minutes: Int) : Freshness

    /** "오프라인 · 14:28 저장본" */
    data class Offline(val time: String) : Freshness

    companion object {
        const val DELAY_MINUTES = 10

        /** slot = latest.json slot("YYYY-MM-DDTHH:MM", KST) */
        fun of(slot: String, stale: Boolean, now: Instant, offline: Boolean): Freshness {
            val elapsed = now.toEpochMilli() - ParkingTime.instantOfKstSlot(slot).toEpochMilli()
            val minutes = Math.floorDiv(elapsed, 60_000L).toInt().coerceAtLeast(0)
            val time = slot.takeLast(5)
            return when {
                offline -> Offline(time)
                stale || minutes >= DELAY_MINUTES -> Delayed(time, minutes)
                else -> Normal(time, minutes)
            }
        }
    }
}
