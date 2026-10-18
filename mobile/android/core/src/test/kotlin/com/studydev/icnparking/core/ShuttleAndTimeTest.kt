package com.studydev.icnparking.core

import com.studydev.icnparking.core.forecast.Freshness
import com.studydev.icnparking.core.shuttle.ShuttleDoc
import com.studydev.icnparking.core.shuttle.ShuttleException
import com.studydev.icnparking.core.shuttle.ShuttleSchedule
import com.studydev.icnparking.core.time.LocalDates
import com.studydev.icnparking.core.time.ParkingTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class ShuttleTest {
    @Test
    fun nextDeparturesMatchWebShNext() {
        val fx = Fixtures.load<ShuttleNextFixture>("fixtures/shuttle/next.json")
        val schedule = ShuttleSchedule(Fixtures.load<ShuttleDoc>("shuttle.json"))
        assertEquals(fx.asOf, schedule.asOf)
        var checked = 0
        for (route in schedule.routes) {
            for (stop in route.stops) {
                val expected = fx.next[route.id]?.get(stop.stop.id)
                assertNotNull("${route.id}/${stop.stop.id}", expected)
                fx.times.forEachIndexed { t, now ->
                    val got = stop.next(fx.n, now).map { listOf(it.departure.minutes, it.wait, if (it.tomorrow) 1 else 0, if (it.departure.marked) 1 else 0, it.departure.index) }
                    assertEquals("${route.id}/${stop.stop.id} now=$now", expected!![t], got)
                    checked++
                }
            }
        }
        assertTrue(checked > 500)
    }

    @Test
    fun invalidTravelIsRejectedLikeShPrep() {
        val fx = Fixtures.load<ShuttleNextFixture>("fixtures/shuttle/next.json")
        assertTrue(fx.invalidRoutes.isNotEmpty())
        for (bad in fx.invalidRoutes) {
            assertThrows(bad.why, ShuttleException::class.java) { ShuttleSchedule(ShuttleDoc(1, fx.asOf, listOf(bad.route))) }
        }
    }
}

class TimeTest {
    @Test
    fun kstAndDateArithmetic() {
        val fx = Fixtures.load<TimeFixture>("fixtures/time.json")
        for (k in fx.kst) {
            val got = ParkingTime.kst(Instant.parse(k.instant))
            assertEquals(k.instant, listOf(k.date, k.slot.toString(), k.secondsOfDay.toString()), listOf(got.date, got.slot.toString(), got.secondsOfDay.toString()))
        }
        for (s in fx.addDays) assertEquals("${s.date} ${s.n}", s.expected, LocalDates.addDays(s.date, s.n))
        for (r in fx.slotRange) assertEquals("${r.date} ${r.i}", r.expected, ParkingTime.slotRange(r.date, r.i))
        assertEquals(6, LocalDates.weekday("2026-10-17"))
    }

    @Test
    fun freshnessMatchesFixtures() {
        val fx = Fixtures.load<FreshnessFixture>("fixtures/freshness.json")
        for (c in fx.cases) {
            val got = Freshness.of(c.latest.slot, c.latest.stale, Instant.parse(c.now), c.offline)
            val want = when (c.expected.kind) {
                "offline" -> Freshness.Offline(c.expected.time)
                "delayed" -> Freshness.Delayed(c.expected.time, c.expected.minutes!!)
                else -> Freshness.Normal(c.expected.time, c.expected.minutes!!)
            }
            assertEquals(c.name, want, got)
        }
    }
}
