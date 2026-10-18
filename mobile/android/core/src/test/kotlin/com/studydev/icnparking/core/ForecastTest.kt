package com.studydev.icnparking.core

import com.studydev.icnparking.core.forecast.CellSchedule
import com.studydev.icnparking.core.forecast.CurrentValue
import com.studydev.icnparking.core.forecast.ForecastEngine
import com.studydev.icnparking.core.forecast.ForecastFailure
import com.studydev.icnparking.core.forecast.ForecastResult
import com.studydev.icnparking.core.forecast.GroupForecast
import com.studydev.icnparking.core.generated.Terminal
import com.studydev.icnparking.core.generated.ZoneGroup
import com.studydev.icnparking.core.generated.Zones
import com.studydev.icnparking.core.time.SlotTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ForecastTest {
    @Test
    fun fixturesCoverGuideScenarios() {
        val names = Fixtures.forecastNames()
        for (required in listOf("normal", "delayed", "offline", "closed", "missing", "capacity-changed", "no-history")) {
            assertTrue(required, names.contains("$required.json"))
        }
    }

    /** 30분 칸 = 앱 값, 1시간 칸 = 웹 forecastOf와 직접 동등 */
    @Test
    fun zoneForecastsMatchFixtures() {
        for (file in Fixtures.forecastNames()) {
            val fx = Fixtures.load<ForecastFixture>("fixtures/forecast/$file")
            val engine = ForecastEngine(fx.days, fx.latest.zones, fx.kst)
            for ((schedule, expected) in listOf(CellSchedule.HALF_HOURLY to fx.expected.zones, CellSchedule.WEB_HOURLY to fx.expected.zonesHourly)) {
                for ((zoneId, want) in expected) check(engine.zone(zoneId, schedule), want, "${fx.name} $zoneId $schedule")
            }
        }
    }

    @Test
    fun groupTotalsMatchFixtures() {
        val groupIds = mapOf(
            "short" to listOf(ZoneGroup.SHORT),
            "long" to listOf(ZoneGroup.LONG),
            "reserved" to listOf(ZoneGroup.RESERVED),
            "total" to ZoneGroup.entries.filter { it.inTotal },
        )
        for (file in Fixtures.forecastNames()) {
            val fx = Fixtures.load<ForecastFixture>("fixtures/forecast/$file")
            val engine = ForecastEngine(fx.days, fx.latest.zones, fx.kst)
            val present = fx.latest.zones.map { it.id }.toSet()
            val results = present.associateWith { engine.zone(it) }
            val terminal = Terminal.fromCode(fx.terminal)!!
            for ((gid, want) in fx.expected.groups) {
                val ids = Zones.zones(terminal).filter { it.id in present && it.category.group in groupIds.getValue(gid) }.map { it.id }
                val got = GroupForecast.of(ids, fx.latest.zones, results)
                val where = "${fx.name} $gid"
                assertEquals(where, want.included, got.included)
                assertEquals(where, want.missing, got.missing)
                assertEquals(where, want.capacity, got.capacity)
                assertEquals(where, want.available, got.available)
                assertClose(where, want.occupancy, got.occupancy)
                assertEquals(where, want.hasForecast, got.hasForecast)
                assertEquals(where, want.cells.size, got.cells.size)
                want.cells.zip(got.cells).forEach { (w, g) ->
                    assertClose("$where cell", w.available, g.available)
                    assertClose("$where cell", w.occupancy, g.occupancy)
                }
            }
        }
    }

    private fun check(got: ForecastResult, want: ExpectedZone, where: String) {
        when (got) {
            is ForecastResult.Available -> {
                assertTrue("$where: 예측됨, 기대 ${want.reason}", want.ok)
                val f = got.forecast
                checkCurrent(f.current, want, where)
                assertEquals(where, want.weeksBack, f.weeksBack)
                assertEquals(where, want.compareDate, f.compareDate)
                assertClose("$where baseParking", want.baseParking, f.baseParking)
                assertClose("$where offset", want.offset, f.offset)
                assertEquals(where, want.cells.size, f.cells.size)
                want.cells.zip(f.cells).forEachIndexed { k, (w, g) ->
                    assertEquals("$where cells[$k] 시각", SlotTime(w.date, w.slot), g.time)
                    assertClose("$where cells[$k].parking", w.parking, g.parking)
                    assertClose("$where cells[$k].baseParking", w.baseParking, g.baseParking)
                    assertClose("$where cells[$k].available", w.available, g.available)
                    assertClose("$where cells[$k].occupancy", w.occupancy, g.occupancy)
                }
            }
            is ForecastResult.Unavailable -> {
                assertFalse("$where: ${got.failure} 실패, 기대는 예측", want.ok)
                assertEquals(where, want.reason, got.failure.fixtureReason)
                (got.failure as? ForecastFailure.CapacityChanged)?.let {
                    assertEquals(where, want.from, it.from)
                    assertEquals(where, want.to, it.to)
                }
                got.current?.let { checkCurrent(it, want, where) } ?: assertNull("$where 기준점", want.anchor)
            }
        }
    }

    private fun checkCurrent(c: CurrentValue, want: ExpectedZone, where: String) {
        assertEquals("$where 기준점", want.anchor, c.anchor)
        assertEquals("$where capacity", want.capacity, c.capacity)
        assertEquals("$where nowParking", want.nowParking, c.parking)
        assertEquals("$where nowAvailable", want.nowAvailable, c.available)
        assertClose("$where nowOccupancy", want.nowOccupancy, c.occupancy)
    }
}
