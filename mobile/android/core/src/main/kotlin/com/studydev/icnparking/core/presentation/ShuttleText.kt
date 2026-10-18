package com.studydev.icnparking.core.presentation

import com.studydev.icnparking.core.generated.Strings
import com.studydev.icnparking.core.shuttle.PreparedStop
import com.studydev.icnparking.core.shuttle.ShuttleRoute
import com.studydev.icnparking.core.shuttle.UpcomingDeparture

/** 셔틀 탭(5r/5s) 문구. mobile/shared/reference/shuttle-text.mjs(디자인 wTxt 규칙) 이식, 같은 픽스처로 검증 */
object ShuttleText {
    /** 운행일 분 → "HH:MM"(24시 이상은 다음 날 시각) */
    fun hm(minutes: Int): String = "%02d:%02d".format(java.util.Locale.ROOT, (minutes / 60) % 24, minutes % 60)

    /** 목록 오른쪽 "다음 도착" */
    fun wait(d: UpcomingDeparture?): String = when {
        d == null -> Strings.Shuttle.none
        d.tomorrow -> Strings.Shuttle.tomorrowAt(hm(d.departure.minuteOfDay))
        d.wait <= 0 -> Strings.Shuttle.arriving
        d.wait < 60 -> Strings.Shuttle.minutes(d.wait.toString())
        else -> Strings.Shuttle.hoursMinutes((d.wait / 60).toString(), (d.wait % 60).toString())
    }

    data class Card(val w1: String, val at1: String, val w2: String, val at2: String, val mark: String, val span: String)

    fun card(route: ShuttleRoute, stop: PreparedStop, next: List<UpcomingDeparture>): Card {
        val d1 = next.getOrNull(0)
        val d2 = next.getOrNull(1)
        val w = wait(d1)
        return Card(
            w1 = when {
                d1 == null -> Strings.Shuttle.none
                d1.tomorrow -> Strings.Shuttle.tomorrow
                w == Strings.Shuttle.arriving -> w
                else -> Strings.Shuttle.after(w)
            },
            at1 = d1?.let { Strings.Shuttle.arrivalAt(hm(it.departure.minuteOfDay)) }.orEmpty(),
            w2 = d2?.let { if (it.tomorrow) Strings.Shuttle.tomorrowAt(hm(it.departure.minuteOfDay)) else Strings.Shuttle.after(wait(it)) }.orEmpty(),
            at2 = d2?.let { if (it.tomorrow) Strings.Shuttle.nextBus else Strings.Shuttle.nextBusAt(hm(it.departure.minuteOfDay)) }.orEmpty(),
            mark = if (d1?.departure?.marked == true && stop.stop.mark != null) Strings.Shuttle.markNotice(stop.stop.mark) else "",
            span = if (route.hours == "24시간") Strings.Shuttle.allDay
            else Strings.Shuttle.firstLast(hm(stop.departures.firstOrNull()?.minutes ?: 0), hm(stop.departures.lastOrNull()?.minutes ?: 0)),
        )
    }

    /** 정차 순서 끝 줄 */
    fun tail(route: ShuttleRoute): String = when {
        route.loop -> Strings.Shuttle.loopTail(route.stops.firstOrNull()?.label.orEmpty(), route.duration)
        route.after != null -> Strings.Shuttle.afterTail(route.after)
        else -> route.duration
    }
}
