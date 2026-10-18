package com.studydev.icnparking.core

import com.studydev.icnparking.core.forecast.ForecastFailure
import com.studydev.icnparking.core.model.DayDoc
import com.studydev.icnparking.core.model.LatestDoc
import com.studydev.icnparking.core.model.ParkingJson
import com.studydev.icnparking.core.shuttle.ShuttleRoute
import com.studydev.icnparking.core.time.SlotTime
import kotlinx.serialization.Serializable
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import java.io.File

/** mobile/shared (node mobile/shared/scripts/fixtures.mjs가 웹 코드 실행 결과로 만든다) */
object Fixtures {
    val shared = File(System.getProperty("sharedDir") ?: error("sharedDir 시스템 속성이 없어요(core/build.gradle.kts)"))

    fun text(path: String): String = File(shared, path).readText()

    inline fun <reified T> load(path: String): T = ParkingJson.decodeFromString(text(path))

    fun forecastNames(): List<String> = File(shared, "fixtures/forecast").list()!!.filter { it.endsWith(".json") }.sorted()
}

@Serializable
data class ForecastFixture(
    val name: String,
    val terminal: String,
    val kst: SlotTime,
    val latest: LatestDoc,
    val days: Map<String, DayDoc>,
    val expected: Expected,
) {
    @Serializable
    data class Expected(
        val zones: Map<String, ExpectedZone>,
        val zonesHourly: Map<String, ExpectedZone>,
        val groups: Map<String, ExpectedGroup>,
    )
}

@Serializable
data class ExpectedZone(
    val ok: Boolean,
    val reason: String? = null,
    val from: Int? = null,
    val to: Int? = null,
    val anchor: SlotTime? = null,
    val capacity: Int? = null,
    val nowParking: Int? = null,
    val nowAvailable: Int? = null,
    val nowOccupancy: Double? = null,
    val weeksBack: Int? = null,
    val compareDate: String? = null,
    val baseParking: Double? = null,
    val offset: Double? = null,
    val cells: List<ExpectedCell> = emptyList(),
)

@Serializable
data class ExpectedCell(
    val date: String,
    val slot: Int,
    val parking: Double? = null,
    val baseParking: Double? = null,
    val available: Double? = null,
    val occupancy: Double? = null,
)

@Serializable
data class ExpectedGroup(
    val capacity: Int,
    val available: Int? = null,
    val occupancy: Double? = null,
    val included: List<String>,
    val missing: Int,
    val hasForecast: Boolean,
    val cells: List<Cell>,
) {
    @Serializable
    data class Cell(val available: Double, val occupancy: Double)
}

@Serializable
data class ShuttleNextFixture(
    val asOf: String,
    val n: Int,
    val times: List<Int>,
    /** route → stop → 시각별 [[m, wait, tomorrow, mark, index]] */
    val next: Map<String, Map<String, List<List<List<Int>>>>>,
    val invalidRoutes: List<Invalid>,
) {
    @Serializable
    data class Invalid(val why: String, val route: ShuttleRoute)
}

@Serializable
data class TimeFixture(val kst: List<Kst>, val addDays: List<Shift>, val slotRange: List<Range>) {
    @Serializable data class Kst(val instant: String, val date: String, val slot: Int, val secondsOfDay: Int)
    @Serializable data class Shift(val date: String, val n: Int, val expected: String)
    @Serializable data class Range(val date: String, val i: Int, val expected: SlotTime)
}

@Serializable
data class FreshnessFixture(val cases: List<Case>) {
    @Serializable
    data class Case(val name: String, val latest: Latest, val now: String, val offline: Boolean, val expected: Expected)
    @Serializable data class Latest(val slot: String, val stale: Boolean)
    @Serializable data class Expected(val kind: String, val minutes: Int? = null, val time: String)
}

fun assertClose(message: String, expected: Double?, actual: Double?) {
    when {
        expected == null && actual == null -> return
        expected == null || actual == null -> fail("$message: expected=$expected actual=$actual")
        else -> assertEquals(message, expected, actual, 1e-9)
    }
}

/** fixtures의 reason 문자열 */
val ForecastFailure.fixtureReason: String
    get() = when (this) {
        ForecastFailure.RecentClosed -> "recentClosed"
        ForecastFailure.LatestClosed -> "latestClosed"
        ForecastFailure.CapacityUnknown -> "capacityUnknown"
        is ForecastFailure.CapacityChanged -> "capacityChanged"
        ForecastFailure.NoCurrent -> "noCurrent"
        ForecastFailure.NoHistory -> "noHistory"
    }
