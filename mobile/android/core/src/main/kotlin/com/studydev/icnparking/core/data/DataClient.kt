package com.studydev.icnparking.core.data

import com.studydev.icnparking.core.model.CalendarDoc
import com.studydev.icnparking.core.model.DayDoc
import com.studydev.icnparking.core.model.LatestDoc
import com.studydev.icnparking.core.model.ParkingJson
import com.studydev.icnparking.core.time.LocalDates
import com.studydev.icnparking.core.time.ParkingTime
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.time.Duration
import java.time.Instant

/** 어디서 온 값인지. 상단 줄 상태(Freshness)의 offline 판단에 쓴다. */
enum class DataOrigin {
    NETWORK,

    /** 아직 신선한(60초 이내) 또는 확정된 저장본 */
    CACHE,

    /** 네트워크 실패로 마지막 저장본을 씀 */
    OFFLINE,
}

data class Loaded<T>(val value: T, val fetchedAt: Instant, val origin: DataOrigin)

sealed class DataClientException(message: String) : IOException(message) {
    class Http(val code: Int) : DataClientException("HTTP $code")

    /** 네트워크도 저장본도 없음 */
    class Unavailable : DataClientException("네트워크와 저장본 모두 없음")
}

/**
 * 웹과 같은 공개 파일만 읽는다(docs/DATA.md). 새 서버 API 없음. 규칙은 iOS DataClient와 같다.
 * - latest.json·calendar.json·오늘 날짜 파일: 60초 동안 저장본 재사용(서버 max-age=60과 같음)
 * - 지난 날짜 파일: 다음 날 00:15(KST) 이후에 받은 것은 확정본으로 보고 다시 받지 않음.
 *   그 전에 받은 것은 자정 확정·마지막 슬롯 반영 전일 수 있어 60초 규칙을 따른다.
 * - 네트워크 실패: 나이와 상관없이 마지막 저장본(origin = OFFLINE)
 * gzip은 OkHttp가 Accept-Encoding을 붙이고 투명하게 푼다.
 */
class DataClient(
    /** "/"로 끝나는 data 디렉터리(웹 config.js dataBase와 같은 값) */
    val baseUrl: String,
    private val store: FileStore,
    private val http: OkHttpClient = OkHttpClient(),
    private val now: () -> Instant = Instant::now,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val lock = Mutex()
    private val inFlight = mutableMapOf<String, Deferred<ByteArray?>>()
    private val finalDays = mutableMapOf<String, Loaded<DayDoc>>()

    suspend fun latest(force: Boolean = false): Loaded<LatestDoc> =
        load("latest.json", LatestDoc.serializer()) { !force && isFresh(it) }

    suspend fun calendar(force: Boolean = false): Loaded<CalendarDoc> =
        load("calendar.json", CalendarDoc.serializer()) { !force && isFresh(it) }

    /** 날짜 파일. 미래 날짜이거나 서버에 없으면(404) null */
    suspend fun day(date: String, force: Boolean = false): Loaded<DayDoc>? {
        val today = ParkingTime.kst(now()).date
        if (date > today) return null
        lock.withLock { finalDays[date] }?.let { return it }
        val loaded = try {
            load("days/$date.json", DayDoc.serializer(), notFoundIsAnswer = true) { isFinal(date, it.fetchedAt) || (!force && isFresh(it)) }
        } catch (e: DataClientException.Http) {
            if (e.code == 404) return null else throw e
        }
        if (isFinal(date, loaded.fetchedAt)) lock.withLock { finalDays[date] = loaded.copy(origin = DataOrigin.CACHE) }
        return loaded
    }

    /** 여러 날짜를 함께 받는다. 없거나 실패한 날짜는 빠진다(웹 loadDays와 같이 null 취급). */
    suspend fun days(dates: Collection<String>): Map<String, DayDoc> = coroutineScope {
        dates.toSet().map { date -> async { date to runCatching { day(date)?.value }.getOrNull() } }
            .awaitAll()
            .mapNotNull { (date, doc) -> doc?.let { date to it } }
            .toMap()
    }

    internal fun isFresh(entry: FileStore.Entry): Boolean {
        val age = Duration.between(entry.fetchedAt, now())
        return !age.isNegative && age < FRESH
    }

    internal fun isFinal(date: String, fetchedAt: Instant): Boolean =
        !fetchedAt.isBefore(ParkingTime.instantOfKstSlot("${LocalDates.addDays(date, 1)}T00:00").plus(FINALIZE_GRACE))

    /** notFoundIsAnswer: 404를 "파일 없음"이라는 답으로 보고 그대로 던진다(날짜 파일). 아니면 다른 실패처럼 저장본으로 대신한다. */
    private suspend fun <T> load(path: String, serializer: KSerializer<T>, notFoundIsAnswer: Boolean = false, reuse: (FileStore.Entry) -> Boolean): Loaded<T> {
        val cached = withContext(Dispatchers.IO) { store.read(path) }
        if (cached != null && reuse(cached)) decode(cached.bytes, serializer)?.let { return Loaded(it, cached.fetchedAt, DataOrigin.CACHE) }
        try {
            val bytes = fetch(path) ?: throw DataClientException.Http(404)
            val value = decode(bytes, serializer) ?: throw IOException("$path 형식 오류")
            val fetchedAt = now()
            withContext(Dispatchers.IO) { runCatching { store.write(path, bytes, fetchedAt) } }
            return Loaded(value, fetchedAt, DataOrigin.NETWORK)
        } catch (e: DataClientException.Http) {
            if (e.code == 404 && notFoundIsAnswer) throw e
            return offline(cached, serializer)
        } catch (e: IOException) {
            return offline(cached, serializer)
        }
    }

    private fun <T> offline(cached: FileStore.Entry?, serializer: KSerializer<T>): Loaded<T> {
        val value = cached?.let { decode(it.bytes, serializer) } ?: throw DataClientException.Unavailable()
        return Loaded(value, cached.fetchedAt, DataOrigin.OFFLINE)
    }

    private fun <T> decode(bytes: ByteArray, serializer: KSerializer<T>): T? =
        runCatching { ParkingJson.decodeFromString(serializer, bytes.decodeToString()) }.getOrNull()

    /** 같은 파일을 동시에 여러 번 요청하면 한 번만 받는다. 404 = null */
    private suspend fun fetch(path: String): ByteArray? {
        val job = lock.withLock { inFlight[path] ?: scope.async { download(path) }.also { inFlight[path] = it } }
        try {
            return job.await()
        } finally {
            lock.withLock { if (inFlight[path] === job) inFlight.remove(path) }
        }
    }

    private fun download(path: String): ByteArray? {
        val request = Request.Builder().url(baseUrl + path).build()
        http.newCall(request).execute().use { response ->
            if (response.code == 404) return null
            if (!response.isSuccessful) throw DataClientException.Http(response.code)
            return response.body.bytes()
        }
    }

    companion object {
        val FRESH: Duration = Duration.ofSeconds(60)

        /** 날짜가 바뀐 뒤 확정본으로 볼 때까지 기다리는 시간(수집기가 자정 뒤 첫 실행에서 전날 파일을 확정) */
        val FINALIZE_GRACE: Duration = Duration.ofMinutes(15)
    }
}
