package com.studydev.icnparking.core.shuttle

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// 셔틀 시간표(mobile/shared/shuttle.json = web/shuttle.json)와 web/shuttle.js shPrep·shNext 이식

@Serializable
data class ShuttleTravel(
    @SerialName("source_url") val sourceUrl: String? = null,
    /** 한 바퀴(순환) 또는 끝까지(편도) 분 */
    val total: Int,
    /** 승강장 id → 첫 승강장부터 누적 분 */
    val elapsed: Map<String, Int>,
)

@Serializable
data class ShuttleStop(
    val id: String,
    val label: String,
    val official: String? = null,
    val note: String = "",
    /** "HH:MM"(24 이상 = 자정 후), 끝 * = 표시편 */
    val t: List<String>,
    /** 표시편 설명("국제업무단지까지만 운행") */
    val mark: String? = null,
)

@Serializable
data class ShuttleRoute(
    val id: String,
    val name: String,
    val desc: String,
    val terminals: List<String>,
    val loop: Boolean,
    val headway: String,
    val hours: String,
    val duration: String,
    val url: String? = null,
    @SerialName("default") val defaultStop: String,
    val travel: ShuttleTravel? = null,
    val stops: List<ShuttleStop>,
    /** 편도 노선 끝 다음 구간 안내 */
    val after: String? = null,
)

@Serializable
data class ShuttleDoc(
    val v: Int? = null,
    @SerialName("as_of") val asOf: String,
    val routes: List<ShuttleRoute>,
)

class ShuttleException(message: String) : IllegalArgumentException(message)

data class Departure(
    /** 운행일 기준 분(자정 후 = 1440 이상) */
    val minutes: Int,
    /** 하루 안의 분(minutes % 1440) */
    val minuteOfDay: Int,
    val marked: Boolean,
    /** 시간표 안 순서 */
    val index: Int,
)

data class UpcomingDeparture(
    val departure: Departure,
    /** 남은 분(내림) */
    val wait: Int,
    /** 오늘 남은 출발이 없어 내일 시간표에서 고름 */
    val tomorrow: Boolean,
)

data class PreparedStop(
    val stop: ShuttleStop,
    val departures: List<Departure>,
    /** 하루 안의 분 순. 같은 분이면 시간표 순(JS 안정 정렬과 같게) */
    val sorted: List<Departure>,
) {
    /** web shNext: 지금(KST 초)보다 엄격히 뒤인 출발 n개, 오늘 없으면 내일로 */
    fun next(n: Int, nowSeconds: Int): List<UpcomingDeparture> {
        val out = mutableListOf<UpcomingDeparture>()
        for (day in 0 until 2) {
            if (out.size >= n) break
            for (d in sorted) {
                val at = (d.minuteOfDay + day * 1440) * 60
                if (at <= nowSeconds) continue
                out += UpcomingDeparture(d, (at - nowSeconds) / 60, day > 0)
                if (out.size >= n) break
            }
        }
        return out
    }
}

data class PreparedRoute(val route: ShuttleRoute, val stops: List<PreparedStop>) {
    val id: String get() = route.id
}

/** web shPrep: 시각을 분으로 바꾸고 구간 소요시간을 검증한다 */
class ShuttleSchedule(doc: ShuttleDoc) {
    val asOf: String = doc.asOf
    val routes: List<PreparedRoute> = doc.routes.map(::prepare)

    fun route(id: String): PreparedRoute? = routes.firstOrNull { it.id == id }

    private fun prepare(route: ShuttleRoute): PreparedRoute {
        route.travel?.let { travel ->
            val elapsed = route.stops.map { travel.elapsed[it.id] }
            val increasing = elapsed.indices.all { i -> elapsed[i] != null && (i == 0 || elapsed[i - 1]?.let { elapsed[i]!! > it } == true) }
            val last = elapsed.lastOrNull()
            if (elapsed.firstOrNull() != 0 || !increasing || last == null || travel.total <= last) {
                throw ShuttleException("${route.name} 구간 소요시간 데이터가 올바르지 않습니다.")
            }
        }
        val stops = route.stops.map { stop ->
            val departures = stop.t.mapIndexed { index, text ->
                val h = text.take(2).toIntOrNull()
                val m = text.drop(3).take(2).toIntOrNull()
                if (text.length < 5 || text[2] != ':' || h == null || m == null) throw ShuttleException("${stop.id} 시각 형식 오류: $text")
                val minutes = h * 60 + m
                Departure(minutes, minutes % 1440, text.endsWith("*"), index)
            }
            PreparedStop(stop, departures, departures.sortedWith(compareBy({ it.minuteOfDay }, { it.index })))
        }
        return PreparedRoute(route, stops)
    }
}
