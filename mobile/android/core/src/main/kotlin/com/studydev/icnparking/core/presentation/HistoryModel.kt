package com.studydev.icnparking.core.presentation

import com.studydev.icnparking.core.generated.Tokens
import com.studydev.icnparking.core.model.DayDoc
import com.studydev.icnparking.core.time.LocalDates
import com.studydev.icnparking.core.time.SlotTime
import kotlin.math.max
import kotlin.math.min

/** 히스토리 탭(5p/5q) 집계. mobile/shared/reference/history.mjs 이식(같은 픽스처로 검증, iOS HistoryModel과 같다) */
class HistoryModel(days: Map<String, DayDoc>, zoneIds: List<String>, now: SlotTime, nDays: Int, holidays: Map<String, String> = emptyMap()) {
    data class Point(val date: String, val hour: Int)

    /** red = 주말·공휴일 */
    data class DayInfo(val date: String, val red: Boolean)

    data class Stats(val averageOccupancy: Double, val maxOccupancy: Double, val averageAvailable: Double, val minAvailable: Double, val fullHours: Int)

    data class Daily(val maxOccupancy: Double, val minAvailable: Double)

    /** id = 구역 id 또는 "all"(그룹 전체) */
    data class Line(val id: String, val values: List<ValuePair?>, val stats: Stats?, val daily: List<Daily?>)

    private data class Bucket(val available: Double = 0.0, val occupancy: Double = 0.0, val capacity: Double = 0.0, val closed: Boolean = false)

    /** N×24+1개(지금 시가 마지막) */
    val points: List<Point>

    /** 일별 표 날짜(오늘까지 nDays일) */
    val dates: List<DayInfo>
    val lines: List<Line>

    init {
        val n = nDays * 24
        val h = now.slot / 12
        val today = now.date
        points = (0..n).map { k ->
            val g = h - (n - k)
            Point(LocalDates.addDays(today, Math.floorDiv(g, 24)), Math.floorMod(g, 24))
        }

        fun bucket(id: String, pt: Point): Bucket? {
            val z = days[pt.date]?.zones?.get(id) ?: return null
            val est = z.e.orEmpty().toSet()
            var a = 0.0
            var o = 0.0
            var c = 0.0
            var count = 0
            var closed = false
            for (i in pt.hour * 12 until pt.hour * 12 + 12) {
                if (pt.date == today && i > now.slot) break
                val p = z.p.getOrNull(i)
                val ci = z.c.getOrNull(i)
                if (ci == 0) closed = true
                if (p == null || ci == null || ci <= 0 || i in est) continue
                a += max(ci - p, 0).toDouble()
                o += min(p, ci).toDouble() / ci
                c += ci.toDouble()
                count++
            }
            if (count > 0) return Bucket(a / count, o / count, c / count)
            return if (closed) Bucket(closed = true) else null
        }

        val buckets = zoneIds.map { id -> points.map { bucket(id, it) } }
        val values = zoneIds.zip(buckets).map { (id, bs) -> id to bs.map { b -> if (b == null || b.closed) null else ValuePair(b.available, b.occupancy) } }.toMutableList()
        if (zoneIds.size > 1) {
            val all = points.indices.map { k ->
                val open = buckets.map { it[k] }.filter { it?.closed != true }
                if (open.isEmpty() || open.any { it == null }) null
                else {
                    val a = open.sumOf { it!!.available }
                    val c = open.sumOf { it!!.capacity }
                    ValuePair(a, 1 - a / c)
                }
            }
            values.add(0, ALL_ID to all)
        }

        val dateList = (0 until nDays).map { LocalDates.addDays(today, it - nDays + 1) }
        dates = dateList.map { d ->
            val w = LocalDates.weekday(d)
            DayInfo(d, w == 0 || w == 6 || holidays.containsKey(d))
        }
        lines = values.map { (id, vs) ->
            val present = vs.filterNotNull()
            val stats = if (present.isEmpty()) null else Stats(
                averageOccupancy = present.fold(0.0) { s, v -> s + v.occupancy } / present.size,
                maxOccupancy = present.maxOf { it.occupancy },
                averageAvailable = present.fold(0.0) { s, v -> s + v.available } / present.size,
                minAvailable = present.minOf { it.available },
                fullHours = present.count { it.occupancy >= Tokens.FULL_THRESHOLD },
            )
            val daily = dateList.map { d ->
                val dv = points.zip(vs).mapNotNull { (pt, v) -> if (pt.date == d) v else null }
                if (dv.isEmpty()) null else Daily(dv.maxOf { it.occupancy }, dv.minOf { it.available })
            }
            Line(id, vs, stats, daily)
        }
    }

    companion object {
        const val ALL_ID = "all"

        /** 필요한 날짜 파일: 오늘부터 nDays일 전까지 */
        fun requiredDates(today: String, nDays: Int): List<String> = (0..nDays).map { LocalDates.addDays(today, -it) }
    }
}
