package com.studydev.icnparking.core.presentation

import com.studydev.icnparking.core.forecast.ForecastResult
import com.studydev.icnparking.core.forecast.forecast
import com.studydev.icnparking.core.generated.Strings
import com.studydev.icnparking.core.generated.Terminal
import com.studydev.icnparking.core.generated.ZoneGroup
import com.studydev.icnparking.core.generated.Zones
import com.studydev.icnparking.core.time.ParkingTime

/** 위젯 소: 주차장 한 곳 숫자 + 1시간 뒤(디자인 5m). iOS SmallWidgetModel과 같은 계산 */
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

/** 위젯 중: 주차장 한 곳의 3시간 그래프(지금 + 30분 점 6개, 점마다 남은 대수) */
data class GraphWidgetModel(
    val title: String,
    val ago: String,
    /** 7개(지금 + 30분 … 3시간). 예측이 없으면 지금 하나 */
    val points: List<Point>,
    val link: DeepLink,
) {
    /** label = "지금" 또는 "10:30" */
    data class Point(val label: String, val available: Int?, val occupancy: Double?)
}

/** 위젯 대: 터미널 묶음(단기·장기·예약)의 주차장별 지금 + 1·2·3시간 뒤 */
data class TableWidgetModel(
    val title: String,
    val ago: String,
    /** 1·2·3시간 뒤 시각 */
    val times: List<String>,
    val rows: List<Row>,
    val link: DeepLink,
) {
    data class Cell(val available: Int, val delta: Int, val occupancy: Double)

    /** word = 숫자 대신 말(운영 중단·확인 필요). cells = 1·2·3시간 뒤, 예측이 없으면 빈 목록 */
    data class Row(val name: String, val isTotal: Boolean, val available: Int?, val word: String?, val cells: List<Cell>)
}

/** 대상의 지금 값과 30분 칸 예상(남은 대수·점유율) */
data class TargetSeries(val now: ValuePair?, val word: String?, val cells: List<ValuePair?>)

object WidgetModels {
    /** 지금 칸 기준 1·2·3시간 뒤 = 30분 칸 1·3·5번 */
    private val hourCells = listOf(1, 3, 5)

    fun ago(minutes: Int): String = Strings.Widget.updatedAgo(if (minutes == 0) Strings.Meta.justNow else Strings.Meta.minutesAgo(minutes.toString()))

    fun series(s: ParkingSnapshot, target: SheetTarget, results: Map<String, ForecastResult>): TargetSeries = when (target) {
        is SheetTarget.Zone -> {
            val zn = s.zoneNow(target.id)
            val now = zn.available?.let { a -> zn.occupancy?.let { ValuePair(a.toDouble(), it) } }
            val cells = results[target.id]?.forecast?.cells?.map { c -> c.available?.let { a -> c.occupancy?.let { ValuePair(a, it) } } } ?: emptyList()
            TargetSeries(now, zn.word, if (now == null) emptyList() else cells)
        }
        else -> {
            val g = s.group(target, results)
            val now = g.available?.let { a -> g.occupancy?.let { ValuePair(a.toDouble(), it) } }
            TargetSeries(now, if (g.included.isEmpty()) Strings.Zone.missing else null, if (g.hasForecast) g.cells.map { ValuePair(it.available, it.occupancy) } else emptyList())
        }
    }

    fun small(s: ParkingSnapshot, target: SheetTarget, agoMinutes: Int): SmallWidgetModel {
        val (now, word, cells) = series(s, target, s.forecasts(target.terminal))
        val available = now?.let { NumberText.round(it.available) }
        val hour = cells.getOrNull(1)
        return SmallWidgetModel(
            title = target.title, available = available, word = word, occupancy = now?.occupancy,
            deltaHour = if (hour != null && available != null) NumberText.round(hour.available) - available else null,
            ago = ago(agoMinutes), link = target.deepLink,
        )
    }

    fun graph(s: ParkingSnapshot, target: SheetTarget, agoMinutes: Int): GraphWidgetModel {
        val (now, _, cells) = series(s, target, s.forecasts(target.terminal))
        val points = listOf(GraphWidgetModel.Point(Strings.Forecast.now, now?.let { NumberText.round(it.available) }, now?.occupancy)) +
            cells.take(6).mapIndexed { k, c ->
                GraphWidgetModel.Point(ParkingTime.slotRange(s.now.date, s.now.slot + 6 * (k + 1)).label, c?.let { NumberText.round(it.available) }, c?.occupancy)
            }
        return GraphWidgetModel(target.title, ago(agoMinutes), points, target.deepLink)
    }

    fun table(s: ParkingSnapshot, terminal: Terminal, group: ZoneGroup, agoMinutes: Int): TableWidgetModel {
        val results = s.forecasts(terminal)
        val ids = Zones.layout(terminal).ids(group)
        val targets = (if (ids.size > 1) listOf<SheetTarget>(SheetTarget.Group(terminal, group)) else emptyList()) + ids.map { SheetTarget.Zone(it) }
        val rows = targets.map { target ->
            val (now, word, cells) = series(s, target, results)
            val available = now?.let { NumberText.round(it.available) }
            val hourly = if (available == null || cells.size < 6) emptyList() else hourCells.mapNotNull { k ->
                cells[k]?.let { c -> TableWidgetModel.Cell(NumberText.round(c.available), NumberText.round(c.available) - available, c.occupancy) }
            }
            val name = if (target is SheetTarget.Zone) Zones.byId[target.id]?.shortName ?: target.id else Strings.Widget.total
            TableWidgetModel.Row(name, target !is SheetTarget.Zone, available, word, if (hourly.size == 3) hourly else emptyList())
        }
        return TableWidgetModel(
            title = SheetTarget.Group(terminal, group).title, ago = ago(agoMinutes),
            times = hourCells.map { ParkingTime.slotRange(s.now.date, s.now.slot + 6 * (it + 1)).label },
            rows = rows, link = DeepLink.Forecast(terminal),
        )
    }
}
