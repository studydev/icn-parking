package com.studydev.icnparking.core.presentation

import com.studydev.icnparking.core.forecast.forecast
import com.studydev.icnparking.core.generated.Strings
import com.studydev.icnparking.core.generated.Terminal
import com.studydev.icnparking.core.generated.ZoneGroup
import com.studydev.icnparking.core.time.ParkingTime

/** 위젯(디자인 5m) 소: 구역·그룹 하나. iOS SmallWidgetModel과 같은 계산 */
data class SmallWidgetModel(
    val title: String,
    val available: Int?,
    /** 숫자 대신 말(운영 중단·확인 필요·만차) */
    val word: String?,
    val occupancy: Double?,
    /** 1시간 뒤 − 지금(남은 대수). 예측이 없으면 null */
    val deltaHour: Int?,
    /** "2분 전 기준" */
    val ago: String,
    val link: DeepLink,
)

/** 위젯 중: 터미널 단기·장기 × 지금·1·2·3시간 뒤 */
data class MediumWidgetModel(val title: String, val ago: String, val rows: List<Row>, val link: DeepLink) {
    data class Cell(val time: String, val available: Int, val delta: Int, val occupancy: Double)

    /** cells = 1·2·3시간 뒤. 예측이 없으면 빈 목록 */
    data class Row(val name: String, val available: Int?, val cells: List<Cell>)
}

object WidgetModels {
    /** 지금 칸 기준 1·2·3시간 뒤 = 30분 칸 1·3·5번 */
    private val hourCells = listOf(1, 3, 5)

    fun ago(minutes: Int): String = Strings.Widget.updatedAgo(if (minutes == 0) Strings.Meta.justNow else Strings.Meta.minutesAgo(minutes.toString()))

    fun small(s: ParkingSnapshot, target: SheetTarget, agoMinutes: Int): SmallWidgetModel {
        val results = s.zoneIds(target).associateWith { s.engine.zone(it) }
        val available: Int?
        val occupancy: Double?
        val word: String?
        val hour: Double?
        if (target is SheetTarget.Zone) {
            val now = s.zoneNow(target.id)
            available = now.available
            occupancy = now.occupancy
            word = now.word
            hour = results[target.id]?.forecast?.cells?.get(1)?.available
        } else {
            val g = s.group(target, results)
            available = g.available
            occupancy = g.occupancy
            word = if (g.included.isEmpty()) Strings.Zone.missing else null
            hour = if (g.hasForecast) g.cells[1].available else null
        }
        return SmallWidgetModel(
            title = target.title, available = available, word = word, occupancy = occupancy,
            deltaHour = if (hour != null && available != null) NumberText.round(hour) - available else null,
            ago = ago(agoMinutes), link = target.deepLink,
        )
    }

    fun medium(s: ParkingSnapshot, terminal: Terminal, agoMinutes: Int): MediumWidgetModel {
        val results = s.forecasts(terminal)
        val rows = listOf(ZoneGroup.SHORT, ZoneGroup.LONG).map { group ->
            val g = s.group(SheetTarget.Group(terminal, group), results)
            val now = g.available
            val cells = if (g.hasForecast && now != null) hourCells.map { k ->
                val c = g.cells[k]
                val a = NumberText.round(c.available)
                MediumWidgetModel.Cell(ParkingTime.slotRange(s.now.date, s.now.slot + 6 * (k + 1)).label, a, a - now, c.occupancy)
            } else emptyList()
            MediumWidgetModel.Row(group.label, now, cells)
        }
        return MediumWidgetModel(Strings.Widget.mediumTitle(terminal.code), ago(agoMinutes), rows, DeepLink.Forecast(terminal))
    }
}
