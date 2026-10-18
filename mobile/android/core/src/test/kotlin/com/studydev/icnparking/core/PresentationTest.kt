package com.studydev.icnparking.core

import com.studydev.icnparking.core.generated.Strings
import com.studydev.icnparking.core.generated.Terminal
import com.studydev.icnparking.core.generated.ZoneGroup
import com.studydev.icnparking.core.model.DayDoc
import com.studydev.icnparking.core.presentation.ForecastRowReason
import com.studydev.icnparking.core.presentation.ForecastTable
import com.studydev.icnparking.core.presentation.ForecastTableItem
import com.studydev.icnparking.core.presentation.HistoryModel
import com.studydev.icnparking.core.presentation.NumberText
import com.studydev.icnparking.core.presentation.ParkingSnapshot
import com.studydev.icnparking.core.presentation.SheetModel
import com.studydev.icnparking.core.presentation.SheetTarget
import com.studydev.icnparking.core.presentation.ShuttleText
import com.studydev.icnparking.core.shuttle.ShuttleDoc
import com.studydev.icnparking.core.shuttle.ShuttleSchedule
import com.studydev.icnparking.core.time.SlotTime
import kotlinx.serialization.Serializable
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@Serializable
data class HistoryFixture(
    val today: String,
    val slot: Int,
    val holidays: Map<String, String>,
    val zoneIds: List<String>,
    val days: Map<String, DayDoc>,
    val expected: Map<String, Expected>,
) {
    @Serializable data class Point(val date: String, val hour: Int)
    @Serializable data class Day(val date: String, val red: Boolean)
    @Serializable data class Value(val available: Double, val occupancy: Double)
    @Serializable data class Stats(val averageOccupancy: Double, val maxOccupancy: Double, val averageAvailable: Double, val minAvailable: Double, val fullHours: Int)
    @Serializable data class Daily(val maxOccupancy: Double, val minAvailable: Double)
    @Serializable data class Line(val id: String, val values: List<Value?>, val stats: Stats? = null, val daily: List<Daily?>)
    @Serializable data class Expected(val points: List<Point>, val dates: List<Day>, val lines: List<Line>)
}

@Serializable
data class ShuttleTextFixture(val times: List<Int>, val routes: Map<String, Route>) {
    @Serializable data class Stop(val wait: String, val w1: String, val at1: String, val w2: String, val at2: String, val mark: String, val span: String)
    @Serializable data class Route(val tail: String, val stops: Map<String, List<Stop>>)
}

class PresentationTest {
    @Test
    fun historyMatchesReference() {
        val fx = Fixtures.load<HistoryFixture>("fixtures/history.json")
        for ((key, want) in fx.expected) {
            val got = HistoryModel(fx.days, fx.zoneIds, SlotTime(fx.today, fx.slot), key.toInt(), fx.holidays)
            assertEquals(key, want.points.map { "${it.date} ${it.hour}" }, got.points.map { "${it.date} ${it.hour}" })
            assertEquals(key, want.dates.map { HistoryModel.DayInfo(it.date, it.red) }, got.dates)
            assertEquals(key, want.lines.map { it.id }, got.lines.map { it.id })
            want.lines.zip(got.lines).forEach { (w, g) ->
                val where = "${key}일 ${w.id}"
                assertEquals(where, w.values.size, g.values.size)
                w.values.zip(g.values).forEachIndexed { k, (wv, gv) ->
                    assertClose("$where [$k] available", wv?.available, gv?.available)
                    assertClose("$where [$k] occupancy", wv?.occupancy, gv?.occupancy)
                }
                assertClose("$where avg", w.stats?.averageOccupancy, g.stats?.averageOccupancy)
                assertClose("$where max", w.stats?.maxOccupancy, g.stats?.maxOccupancy)
                assertClose("$where avgA", w.stats?.averageAvailable, g.stats?.averageAvailable)
                assertClose("$where minA", w.stats?.minAvailable, g.stats?.minAvailable)
                assertEquals(where, w.stats?.fullHours, g.stats?.fullHours)
                w.daily.zip(g.daily).forEach { (wd, gd) ->
                    assertClose("$where daily", wd?.maxOccupancy, gd?.maxOccupancy)
                    assertClose("$where daily", wd?.minAvailable, gd?.minAvailable)
                }
            }
        }
    }

    @Test
    fun shuttleCardAndListTextMatchDesignRules() {
        val fx = Fixtures.load<ShuttleTextFixture>("fixtures/shuttle/text.json")
        val schedule = ShuttleSchedule(Fixtures.load<ShuttleDoc>("shuttle.json"))
        for (route in schedule.routes) {
            val want = fx.routes.getValue(route.id)
            assertEquals(route.id, want.tail, ShuttleText.tail(route.route))
            for (stop in route.stops) {
                fx.times.forEachIndexed { t, now ->
                    val w = want.stops.getValue(stop.stop.id)[t]
                    val next = stop.next(2, now)
                    val card = ShuttleText.card(route.route, stop, next)
                    val where = "${route.id}/${stop.stop.id} $now"
                    assertEquals(where, w.wait, ShuttleText.wait(next.firstOrNull()))
                    assertEquals(where, listOf(w.w1, w.at1, w.w2, w.at2, w.mark, w.span), listOf(card.w1, card.at1, card.w2, card.at2, card.mark, card.span))
                }
            }
        }
    }

    private fun snapshot(name: String): ParkingSnapshot {
        val fx = Fixtures.load<ForecastFixture>("fixtures/forecast/$name.json")
        return ParkingSnapshot(fx.latest, fx.days, now = fx.kst)
    }

    @Test
    fun forecastTableOrderAndReasons() {
        val table = ForecastTable(snapshot("closed"), Terminal.T1)
        assertEquals(listOf("15:00", "15:30", "16:00", "16:30", "17:00", "17:30"), table.times.map { it.label })
        val rows = table.items.filterIsInstance<ForecastTableItem.Row>().map { it.row }
        assertEquals(
            listOf("total", "t1-short-gf", "t1-short-b1", "t1-short-b2", "t1-short-b3", "t1-tower-p1", "t1-tower-p2", "t1-long-p1", "t1-long-p2", "t1-long-p3", "t1-resv-p5"),
            rows.map { it.id },
        )
        val byId = rows.associateBy { it.id }
        assertEquals(ForecastRowReason.CLOSED, byId.getValue("t1-short-b2").reason)
        assertEquals(ForecastRowReason.CLOSED, byId.getValue("t1-short-b3").reason)
        assertNull(byId.getValue("t1-short-b1").reason)
        assertEquals(6, byId.getValue("t1-short-b1").cells.size)
        assertEquals(ForecastRowReason.MISSING, byId.getValue("t1-long-p1").reason)
        assertEquals(listOf(Strings.Forecast.sectionShort, Strings.Forecast.sectionLong), table.items.filterIsInstance<ForecastTableItem.Label>().map { it.text })
    }

    @Test
    fun sheetExplainsComparisonAndCapacityChange() {
        val s = snapshot("capacity-changed")
        val ok = SheetModel.of(s, SheetTarget.Zone("t1-short-b1"))
        assertEquals("T1 · 단기주차장", ok.kicker)
        assertEquals(6, ok.cells.size)
        assertEquals(7, ok.forecast.size)
        assertEquals(13, ok.base.size)
        assertTrue(ok.explain, ok.explain.startsWith("지난주 토요일(10/10) 같은 시각 흐름에 지금 차이("))
        assertEquals("14:30 기준 · 2분 전 · 30분 간격 · 비교 주 2026-10-10(토)", ok.footer("14:30 기준 · 2분 전"))
        val stopped = SheetModel.of(s, SheetTarget.Zone("t1-short-b2"))
        assertEquals("운영 면수가 바뀐 직후(1,050 → 980대)라 예상을 잠시 멈췄어요.", stopped.explain)
        assertTrue(stopped.cells.isEmpty())
        val group = SheetModel.of(s, SheetTarget.Group(Terminal.T1, ZoneGroup.SHORT))
        assertEquals("단기주차장 전체", group.name)
        assertEquals(6, group.cells.size)
        assertTrue(group.footer("x").endsWith(Strings.Sheet.footerGroupSuffix))
    }

    @Test
    fun numberText() {
        assertEquals("1,050", NumberText.grouped(1050))
        assertEquals("12,345,678", NumberText.grouped(12_345_678))
        assertEquals("999", NumberText.grouped(999))
        assertEquals(3, NumberText.round(2.5))
        assertEquals(-2, NumberText.round(-2.5))
        assertEquals("▼9", NumberText.delta(-9))
        assertEquals("▲1,200", NumberText.delta(1200))
        assertEquals("±0", NumberText.delta(0))
        assertEquals("10/9", NumberText.monthDay("2026-10-09"))
    }
}
