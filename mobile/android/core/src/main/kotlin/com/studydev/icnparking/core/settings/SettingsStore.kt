package com.studydev.icnparking.core.settings

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.studydev.icnparking.core.generated.Terminal
import com.studydev.icnparking.core.generated.Zones
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import okio.Path.Companion.toOkioPath
import java.io.File

/** 실시간·예측 숫자 단위(헤더 토글) */
enum class DisplayUnit(val key: String) {
    AVAILABLE("avail"),
    OCCUPANCY("occ"),
    ;

    companion object {
        fun fromKey(key: String?): DisplayUnit = entries.firstOrNull { it.key == key } ?: AVAILABLE
    }
}

/** 기기에 저장하는 설정(README State 저장: unit, defaultTerm, shRoute, shStop + 예측 ▲▼ 표시). 즐겨찾기 없음. 키 이름은 iOS SettingsStore와 같다 */
data class AppSettings(
    val unit: DisplayUnit = DisplayUnit.AVAILABLE,
    val defaultTerminal: Terminal = Terminal.T1,
    /** 예측 칸 아래 ▲▼ 변화량(디자인 Tweak showDelta, 기본 꺼짐) */
    val showDelta: Boolean = false,
    /** 터미널별 마지막 선택 노선. 없으면 그 터미널 노선 순서의 첫 노선 */
    private val shuttleRoutes: Map<Terminal, String> = emptyMap(),
    /** 노선별 마지막 선택 승강장. 없으면 shuttle.json의 노선 default */
    private val shuttleStops: Map<String, String> = emptyMap(),
) {
    fun shuttleRoute(terminal: Terminal): String {
        val order = Zones.layout(terminal).shuttleRoutes
        return shuttleRoutes[terminal]?.takeIf { it in order } ?: order.first()
    }

    fun shuttleStop(route: String): String? = shuttleStops[route]
}

/** DataStore Preferences. 파일만 받으므로 JVM 단위 테스트에서도 그대로 쓴다. */
class SettingsStore(private val dataStore: DataStore<Preferences>) {
    val settings: Flow<AppSettings> = dataStore.data.map { p ->
        AppSettings(
            unit = DisplayUnit.fromKey(p[UNIT]),
            defaultTerminal = p[DEFAULT_TERMINAL]?.let(Terminal::fromCode) ?: Terminal.T1,
            showDelta = p[SHOW_DELTA] ?: false,
            shuttleRoutes = Terminal.entries.mapNotNull { t -> p[routeKey(t)]?.let { t to it } }.toMap(),
            shuttleStops = p.asMap().entries.mapNotNull { (k, v) -> if (k.name.startsWith(STOP_PREFIX) && v is String) k.name.removePrefix(STOP_PREFIX) to v else null }.toMap(),
        )
    }

    suspend fun setUnit(unit: DisplayUnit) { dataStore.edit { it[UNIT] = unit.key } }

    suspend fun setDefaultTerminal(terminal: Terminal) { dataStore.edit { it[DEFAULT_TERMINAL] = terminal.code } }

    suspend fun setShowDelta(show: Boolean) { dataStore.edit { it[SHOW_DELTA] = show } }

    suspend fun setShuttleRoute(terminal: Terminal, route: String) { dataStore.edit { it[routeKey(terminal)] = route } }

    suspend fun setShuttleStop(route: String, stop: String) { dataStore.edit { it[stringPreferencesKey(STOP_PREFIX + route)] = stop } }

    companion object {
        private val UNIT = stringPreferencesKey("unit")
        private val DEFAULT_TERMINAL = stringPreferencesKey("default_terminal")
        private val SHOW_DELTA = booleanPreferencesKey("show_delta")
        private const val STOP_PREFIX = "shuttle_stop_"
        private fun routeKey(t: Terminal) = stringPreferencesKey("shuttle_route_${t.code}")

        /** file은 ".preferences_pb"로 끝나야 한다(DataStore 규칙) */
        fun create(file: File, scope: CoroutineScope): SettingsStore =
            SettingsStore(PreferenceDataStoreFactory.createWithPath(scope = scope, produceFile = { file.toOkioPath() }))
    }
}
