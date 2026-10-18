package com.studydev.icnparking.core.time

import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.LocalDate
import java.util.Locale

/** 날짜는 웹과 같이 "YYYY-MM-DD" 문자열로 다룬다(문자열 비교 = 날짜 비교). */
object LocalDates {
    fun addDays(date: String, n: Int): String = LocalDate.parse(date).plusDays(n.toLong()).toString()

    /** 0 = 일요일 */
    fun weekday(date: String): Int = LocalDate.parse(date).dayOfWeek.value % 7
}

/** KST 날짜 + 5분 슬롯(0 = 00:00 … 287 = 23:55) */
@Serializable
data class SlotTime(val date: String, val slot: Int) {
    /** "HH:MM" */
    val label: String get() = "%02d:%02d".format(Locale.ROOT, slot / 12, (slot % 12) * 5)
}

object ParkingTime {
    const val SLOTS_PER_DAY = 288
    private const val KST_OFFSET = 9 * 3600L

    /** web slotRange: date 기준 i번째 슬롯(음수·288 이상이면 날짜를 넘긴다) */
    fun slotRange(date: String, i: Int): SlotTime =
        SlotTime(LocalDates.addDays(date, Math.floorDiv(i, SLOTS_PER_DAY)), Math.floorMod(i, SLOTS_PER_DAY))

    data class Kst(val date: String, val slot: Int, val secondsOfDay: Int) {
        val slotTime: SlotTime get() = SlotTime(date, slot)
    }

    fun kst(instant: Instant): Kst {
        val seconds = instant.epochSecond + KST_OFFSET
        val day = Math.floorDiv(seconds, 86400L)
        val sod = (seconds - day * 86400L).toInt()
        return Kst(LocalDate.ofEpochDay(day).toString(), sod / 300, sod)
    }

    /** "YYYY-MM-DDTHH:MM"(KST) → 시각 */
    fun instantOfKstSlot(slot: String): Instant {
        val (h, m) = slot.substring(11).split(":").map { it.toInt() }
        return Instant.ofEpochSecond(LocalDate.parse(slot.substring(0, 10)).toEpochDay() * 86400L + h * 3600 + m * 60 - KST_OFFSET)
    }
}
