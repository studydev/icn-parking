package com.studydev.icnparking.core

import com.studydev.icnparking.core.data.DataClient
import com.studydev.icnparking.core.data.DataClientException
import com.studydev.icnparking.core.data.DataOrigin
import com.studydev.icnparking.core.data.FileStore
import com.studydev.icnparking.core.forecast.Freshness
import com.studydev.icnparking.core.time.ParkingTime
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import okhttp3.OkHttpClient
import okio.Buffer
import okio.GzipSink
import okio.buffer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.IOException
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

class TestClock(kstSlot: String) {
    @Volatile var now: Instant = ParkingTime.instantOfKstSlot(kstSlot)
    fun advance(seconds: Long) { now = now.plusSeconds(seconds) }
}

class DataClientTest {
    @get:Rule val tmp = TemporaryFolder()

    private val server = MockWebServer()
    private val bodies = ConcurrentHashMap<String, Pair<String, Boolean>>()
    private val counts = ConcurrentHashMap<String, AtomicInteger>()
    @Volatile private var offline = false
    @Volatile private var delayMs = 0L
    private lateinit var root: File
    private var clock = TestClock("2026-10-17T14:30")

    @Before
    fun setUp() {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val path = request.url.encodedPath.removePrefix("/data/")
                counts.getOrPut(path) { AtomicInteger() }.incrementAndGet()
                if (delayMs > 0) Thread.sleep(delayMs)
                val (body, gzip) = bodies[path] ?: return MockResponse.Builder().code(404).build()
                if (!gzip) return MockResponse.Builder().code(200).body(body).build()
                val buffer = Buffer()
                GzipSink(buffer).buffer().use { it.writeUtf8(body) }
                return MockResponse.Builder().code(200).addHeader("Content-Encoding", "gzip").body(buffer).build()
            }
        }
        server.start()
        root = tmp.newFolder("store")
    }

    @After
    fun tearDown() = server.close()

    private fun client(): DataClient {
        val http = OkHttpClient.Builder().addInterceptor { chain -> if (offline) throw IOException("offline") else chain.proceed(chain.request()) }.build()
        val c = clock
        return DataClient(server.url("/data/").toString(), FileStore(root), http) { c.now }
    }

    private fun count(path: String) = counts[path]?.get() ?: 0
    private fun set(path: String, body: String?, gzip: Boolean = false) { if (body == null) bodies.remove(path) else bodies[path] = body to gzip }
    private fun latestJson(slot: String, p: Int) = """{"v":1,"slot":"$slot","stale":false,"zones":[{"id":"t1-short-b1","p":$p,"c":520}],"extra":"무시"}"""
    private fun dayJson(date: String, p: Int) = """{"v":1,"date":"$date","zones":{"t1-short-b1":{"p":[$p,null],"c":[520,520],"e":[1]}}}"""

    @Test
    fun latestIsReusedFor60SecondsThenRefetched() = runBlocking {
        set("latest.json", latestJson("2026-10-17T14:30", 300))
        val c = client()
        val first = c.latest()
        assertEquals(DataOrigin.NETWORK, first.origin)
        assertEquals(300, first.value.zones.first().p)

        clock.advance(59)
        set("latest.json", latestJson("2026-10-17T14:35", 310))
        val second = c.latest()
        assertEquals(DataOrigin.CACHE, second.origin)
        assertEquals("2026-10-17T14:30", second.value.slot)
        assertEquals(1, count("latest.json"))

        clock.advance(2)
        val third = c.latest()
        assertEquals(DataOrigin.NETWORK, third.origin)
        assertEquals("2026-10-17T14:35", third.value.slot)

        assertEquals(DataOrigin.NETWORK, c.latest(force = true).origin)
        assertEquals(3, count("latest.json"))
    }

    @Test
    fun gzipResponseIsDecodedTransparently() = runBlocking {
        set("latest.json", latestJson("2026-10-17T14:30", 321), gzip = true)
        assertEquals(321, client().latest().value.zones.first().p)
    }

    @Test
    fun offlineFallsBackToLastSavedResponseOfAnyAge() = runBlocking {
        set("latest.json", latestJson("2026-10-17T14:28", 300))
        client().latest()
        val savedAt = clock.now
        clock.advance(3600)
        offline = true
        // 앱을 다시 켠 것처럼 새 인스턴스: 디스크 저장본만 남아 있다
        val saved = client().latest()
        assertEquals(DataOrigin.OFFLINE, saved.origin)
        assertEquals("2026-10-17T14:28", saved.value.slot)
        assertEquals(savedAt, saved.fetchedAt)
        assertEquals(Freshness.Offline("14:28"), Freshness.of(saved.value.slot, saved.value.stale ?: false, clock.now, saved.origin == DataOrigin.OFFLINE))
    }

    @Test
    fun offlineWithoutSavedResponseThrows() = runBlocking {
        offline = true
        try {
            client().latest()
            fail("저장본이 없으면 실패해야 해요")
        } catch (e: DataClientException.Unavailable) {
            // 기대한 실패
        }
    }

    @Test
    fun latest404UsesSavedResponse() = runBlocking {
        set("latest.json", latestJson("2026-10-17T14:30", 300))
        val c = client()
        c.latest()
        clock.advance(120)
        set("latest.json", null)
        assertEquals(DataOrigin.OFFLINE, c.latest().origin)
    }

    @Test
    fun finalizedPastDayIsNeverFetchedAgain() = runBlocking {
        set("days/2026-10-10.json", dayJson("2026-10-10", 100))
        val c = client()
        val first = c.day("2026-10-10")
        assertEquals(DataOrigin.NETWORK, first?.origin)
        assertEquals(listOf(1), first?.value?.zones?.get("t1-short-b1")?.e)

        clock.advance(30 * 86400L)
        set("days/2026-10-10.json", dayJson("2026-10-10", 999))
        val again = c.day("2026-10-10", force = true)
        assertEquals(DataOrigin.CACHE, again?.origin)
        assertEquals(100, again?.value?.zones?.get("t1-short-b1")?.p?.first())
        // 디스크에서도(새 인스턴스) 다시 받지 않는다
        assertEquals(100, client().day("2026-10-10")?.value?.zones?.get("t1-short-b1")?.p?.first())
        assertEquals(1, count("days/2026-10-10.json"))
    }

    @Test
    fun yesterdayFetchedRightAfterMidnightIsNotTreatedAsFinal() = runBlocking {
        clock = TestClock("2026-10-18T00:05")
        set("days/2026-10-17.json", dayJson("2026-10-17", 100))
        val c = client()
        c.day("2026-10-17")
        assertFalse(c.isFinal("2026-10-17", clock.now))

        // 00:15 전 저장본은 60초 뒤 다시 받는다(자정 확정본으로 교체)
        clock.advance(61)
        set("days/2026-10-17.json", dayJson("2026-10-17", 101))
        assertEquals(DataOrigin.NETWORK, c.day("2026-10-17")?.origin)

        // 00:15 이후에 받은 것은 확정본
        clock.advance(15 * 60L)
        assertEquals(DataOrigin.NETWORK, c.day("2026-10-17", force = true)?.origin)
        clock.advance(86400L)
        assertEquals(DataOrigin.CACHE, c.day("2026-10-17", force = true)?.origin)
        assertEquals(3, count("days/2026-10-17.json"))
    }

    @Test
    fun todayFollows60SecondRule() = runBlocking {
        set("days/2026-10-17.json", dayJson("2026-10-17", 100))
        val c = client()
        c.day("2026-10-17")
        clock.advance(30)
        assertEquals(DataOrigin.CACHE, c.day("2026-10-17")?.origin)
        clock.advance(31)
        assertEquals(DataOrigin.NETWORK, c.day("2026-10-17")?.origin)
    }

    @Test
    fun futureDayAndMissingFileReturnNullWithoutCaching() = runBlocking {
        val c = client()
        assertNull(c.day("2026-10-18"))
        assertEquals(0, count("days/2026-10-18.json"))
        assertNull(c.day("2026-09-01"))
        set("days/2026-09-01.json", dayJson("2026-09-01", 5))
        assertNotNull(c.day("2026-09-01"))
    }

    @Test
    fun daysLoadsConcurrentlyAndSkipsMissing() = runBlocking {
        set("days/2026-10-16.json", dayJson("2026-10-16", 1))
        set("days/2026-10-17.json", dayJson("2026-10-17", 2))
        val docs = client().days(listOf("2026-10-15", "2026-10-16", "2026-10-17", "2026-10-17", "2026-10-18"))
        assertEquals(setOf("2026-10-16", "2026-10-17"), docs.keys)
        assertEquals(1, count("days/2026-10-17.json"))
    }

    @Test
    fun concurrentRequestsForSameFileShareOneDownload() = runBlocking {
        set("latest.json", latestJson("2026-10-17T14:30", 300))
        delayMs = 300
        val c = client()
        val a = async { c.latest() }
        val b = async { c.latest() }
        assertEquals(a.await().value, b.await().value)
        assertEquals(1, count("latest.json"))
    }

    @Test
    fun oldSchemaDirectoryIsRemoved() {
        val old = File(root, "v0/days").apply { mkdirs() }
        val store = FileStore(root)
        assertFalse(old.exists())
        assertTrue(store.directory.name == "v${FileStore.SCHEMA_VERSION}")
    }

    @Test
    fun calendarDecodesDaysAndHolidays() = runBlocking {
        set("calendar.json", """{"start":"2026-10-01","days":{"2026-10-16":{"n":288,"T1":{"max":0.9}},"2026-10-17":{"n":175}},"holidays":{"2026-10-09":"한글날"}}""")
        val cal = client().calendar().value
        assertEquals("2026-10-01", cal.start)
        assertEquals(setOf("2026-10-16", "2026-10-17"), cal.dates)
        assertEquals("한글날", cal.holidays["2026-10-09"])
    }
}
