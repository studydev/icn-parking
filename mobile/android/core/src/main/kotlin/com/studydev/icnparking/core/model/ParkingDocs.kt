package com.studydev.icnparking.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

// 공개 데이터 파일 형식(docs/DATA.md). latest.json · days/YYYY-MM-DD.json · calendar.json

/** 모르는 필드는 무시(서버가 필드를 늘려도 앱이 깨지지 않게) */
val ParkingJson = Json { ignoreUnknownKeys = true }

@Serializable
data class LatestZone(
    val id: String,
    val terminal: String? = null,
    val category: String? = null,
    val name: String? = null,
    val order: Int? = null,
    /** 주차 대수. MISSING이면 null */
    val p: Int? = null,
    /** 운영 면수. 0 = 운영 중단 */
    val c: Int? = null,
    val slot: String? = null,
    val flags: List<String> = emptyList(),
)

@Serializable
data class LatestDoc(
    val v: Int? = null,
    /** KST 5분 슬롯 "YYYY-MM-DDTHH:MM" */
    val slot: String,
    val start: String? = null,
    val ok: Boolean? = null,
    val stale: Boolean? = null,
    val error: String? = null,
    @SerialName("generated_at") val generatedAt: String? = null,
    @SerialName("last_attempt_at") val lastAttemptAt: String? = null,
    @SerialName("last_ok_at") val lastOkAt: String? = null,
    val zones: List<LatestZone>,
)

@Serializable
data class DayZone(
    /** 288칸 주차 대수 */
    val p: List<Int?>,
    /** 288칸 운영 면수 */
    val c: List<Int?>,
    /** 수집 누락을 추정으로 메운 슬롯 인덱스 */
    val e: List<Int>? = null,
)

@Serializable
data class DayDoc(
    val v: Int? = null,
    val date: String,
    val zones: Map<String, DayZone>,
)

@Serializable
data class CalendarDoc(
    val start: String? = null,
    private val days: Map<String, JsonElement> = emptyMap(),
    /** 날짜 → 공휴일 이름 */
    val holidays: Map<String, String> = emptyMap(),
) {
    /** 존재하는 날짜 */
    val dates: Set<String> get() = days.keys
}
