package com.studydev.icnparking.core.presentation

import com.studydev.icnparking.core.forecast.CellSchedule
import com.studydev.icnparking.core.forecast.ForecastEngine
import com.studydev.icnparking.core.forecast.ForecastResult
import com.studydev.icnparking.core.forecast.GroupForecast
import com.studydev.icnparking.core.generated.Strings
import com.studydev.icnparking.core.generated.Terminal
import com.studydev.icnparking.core.generated.Tokens
import com.studydev.icnparking.core.generated.ZoneGroup
import com.studydev.icnparking.core.generated.Zones
import com.studydev.icnparking.core.model.DayDoc
import com.studydev.icnparking.core.model.LatestDoc
import com.studydev.icnparking.core.model.LatestZone
import com.studydev.icnparking.core.time.LocalDates
import com.studydev.icnparking.core.time.SlotTime
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/** 구역 지금 값(latest.json). 운영 중단 = c == 0, 현재값 없음 = p 또는 c 없음. iOS ZoneNow와 같다 */
data class ZoneNow(val id: String, val capacity: Int?, val parking: Int?) {
    constructor(id: String, latest: LatestZone?) : this(id, latest?.c, latest?.p)

    val closed: Boolean get() = capacity == 0
    val missing: Boolean get() = !closed && (parking == null || capacity == null || capacity < 0)

    /** 숫자를 보여 줄 수 없음(운영 중단·확인 필요) */
    val dead: Boolean get() = closed || missing
    val available: Int? get() = if (dead) null else max(capacity!! - parking!!, 0)
    val occupancy: Double? get() = if (dead) null else min(parking!!.toDouble() / capacity!!, 1.0)
    val isFull: Boolean get() = (occupancy ?: 0.0) >= Tokens.FULL_THRESHOLD

    /** 숫자 대신 보여 줄 말(운영 중단 · 확인 필요 · 만차) */
    val word: String?
        get() = when {
            closed -> Strings.Zone.closed
            missing -> Strings.Zone.missing
            isFull -> Strings.Zone.full
            else -> null
        }

    val accessibility: String
        get() {
            val name = Zones.byId[id]?.name ?: id
            return word?.let { Strings.Zone.a11yState(name, it) } ?: Strings.Zone.a11yAvailable(name, NumberText.grouped(available ?: 0))
        }
}

/** 상세 시트 대상 */
sealed interface SheetTarget {
    data class Zone(val id: String) : SheetTarget
    data class Group(val terminal: Terminal, val group: ZoneGroup) : SheetTarget

    /** 터미널 전체(예약 제외) */
    data class Total(val terminal: Terminal) : SheetTarget
}

/** 화면이 쓰는 데이터 한 벌. 예측·합계·시트·히스토리는 모두 여기서 계산한다(iOS ParkingSnapshot과 같다). */
class ParkingSnapshot(
    val latest: LatestDoc,
    val days: Map<String, DayDoc>,
    val holidays: Map<String, String> = emptyMap(),
    /** 지금 KST 날짜·슬롯(기기 시각 기준, 웹 D.now와 같음) */
    val now: SlotTime,
) {
    val engine: ForecastEngine by lazy { ForecastEngine(days, latest.zones, now) }

    fun zoneNow(id: String): ZoneNow = ZoneNow(id, latest.zones.firstOrNull { it.id == id })

    /** 터미널 구역 id(zones.yaml 순서) */
    fun zoneIds(terminal: Terminal, groups: List<ZoneGroup> = ZoneGroup.entries): List<String> =
        Zones.zones(terminal).filter { it.category.group in groups }.map { it.id }

    fun zoneIds(target: SheetTarget): List<String> = when (target) {
        is SheetTarget.Zone -> listOf(target.id)
        is SheetTarget.Group -> zoneIds(target.terminal, listOf(target.group))
        is SheetTarget.Total -> zoneIds(target.terminal, ZoneGroup.entries.filter { it.inTotal })
    }

    /** 터미널 구역별 30분 칸 예측 */
    fun forecasts(terminal: Terminal): Map<String, ForecastResult> = zoneIds(terminal).associateWith { engine.zone(it) }

    fun group(target: SheetTarget, results: Map<String, ForecastResult> = emptyMap()): GroupForecast =
        GroupForecast.of(zoneIds(target), latest.zones, results)

    companion object {
        /** 예측에 필요한 날짜 파일: 오늘·어제(기준점 되짚기), 1~4주 전 같은 요일과 앞뒤 하루(±2슬롯·자정 넘김) */
        fun forecastDates(today: String): List<String> =
            listOf(today, LocalDates.addDays(today, -1)) + (1..4).flatMap { w -> (-1..1).map { k -> LocalDates.addDays(today, -7 * w + k) } }

        val halfHourly = CellSchedule.HALF_HOURLY
    }
}

/** 숫자 문구. 기기 언어와 상관없이 디자인과 같은 모양(1,234 · ▲12 · ▼3 · ±0) */
object NumberText {
    /** JS Math.round와 같은 반올림 */
    fun round(v: Double): Int = floor(v + 0.5).toInt()

    fun grouped(v: Double): String = grouped(round(v))

    /** 묶음 쉼표(디자인 H.fmt = toLocaleString('ko-KR')) */
    fun grouped(n: Int): String {
        val digits = abs(n).toString()
        val out = StringBuilder()
        digits.forEachIndexed { i, ch ->
            if (i > 0 && (digits.length - i) % 3 == 0) out.append(',')
            out.append(ch)
        }
        return if (n < 0) "-$out" else out.toString()
    }

    /** 쉼표 없는 정수(예측 표 칸) */
    fun plain(v: Double): String = round(v).toString()

    fun percent(occupancy: Double): String = round(occupancy * 100).toString()

    fun delta(d: Int): String = when {
        d < 0 -> Strings.Forecast.deltaDown(grouped(-d))
        d > 0 -> Strings.Forecast.deltaUp(grouped(d))
        else -> Strings.Forecast.deltaZero
    }

    /** 접근성 "9대 감소" */
    fun change(d: Int): String = when {
        d < 0 -> Strings.Forecast.changeDown(grouped(-d))
        d > 0 -> Strings.Forecast.changeUp(grouped(d))
        else -> Strings.Forecast.changeNone
    }

    /** "M/D" */
    fun monthDay(date: String): String {
        val p = date.split("-").map { it.toInt() }
        return "${p[1]}/${p[2]}"
    }
}
