package com.studydev.icnparking.core

import com.studydev.icnparking.core.generated.Terminal
import com.studydev.icnparking.core.settings.AppSettings
import com.studydev.icnparking.core.settings.DisplayUnit
import com.studydev.icnparking.core.settings.SettingsStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class SettingsStoreTest {
    @get:Rule val tmp = TemporaryFolder()

    @Test
    fun defaultsFollowReadme() = runBlocking {
        val s = AppSettings()
        assertEquals(DisplayUnit.AVAILABLE, s.unit)
        assertEquals(Terminal.T1, s.defaultTerminal)
        // 노선 기본 = 터미널 노선 순서의 첫 노선(T1: 01, T2: 02)
        assertEquals("01", s.shuttleRoute(Terminal.T1))
        assertEquals("02", s.shuttleRoute(Terminal.T2))
        assertNull(s.shuttleStop("01"))
    }

    @Test
    fun valuesPersistAcrossReopen() = runBlocking {
        val file = tmp.root.resolve("settings.preferences_pb")
        val scope1 = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = SettingsStore.create(file, scope1)
        store.setUnit(DisplayUnit.OCCUPANCY)
        store.setDefaultTerminal(Terminal.T2)
        store.setShuttleRoute(Terminal.T2, "03")
        store.setShuttleStop("03", "D00343")
        store.setShowDelta(true)
        scope1.cancel()

        // DataStore는 같은 파일에 인스턴스 하나만 허용 → 앞 scope를 닫고 다시 연다(앱 재시작과 같음)
        val scope2 = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val reopened = SettingsStore.create(file, scope2).settings.first()
        assertEquals(DisplayUnit.OCCUPANCY, reopened.unit)
        assertEquals(Terminal.T2, reopened.defaultTerminal)
        assertEquals("03", reopened.shuttleRoute(Terminal.T2))
        assertEquals("01", reopened.shuttleRoute(Terminal.T1))
        assertEquals("D00343", reopened.shuttleStop("03"))
        assertEquals(true, reopened.showDelta)
        scope2.cancel()
    }

    @Test
    fun savedRouteOutsideTerminalOrderFallsBackToFirst() = runBlocking {
        val file = tmp.root.resolve("bad.preferences_pb")
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = SettingsStore.create(file, scope)
        store.setShuttleRoute(Terminal.T1, "99")
        assertEquals("01", store.settings.first().shuttleRoute(Terminal.T1))
        scope.cancel()
    }
}
