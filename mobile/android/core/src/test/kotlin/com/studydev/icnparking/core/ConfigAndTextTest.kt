package com.studydev.icnparking.core

import com.studydev.icnparking.core.forecast.Freshness
import com.studydev.icnparking.core.forecast.isWarning
import com.studydev.icnparking.core.forecast.text
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ConfigAndTextTest {
    @Test
    fun dataBaseUrlNormalization() {
        assertNull(normalizeDataBaseUrl(null))
        assertNull(normalizeDataBaseUrl(""))
        assertNull(normalizeDataBaseUrl("$(ICN_DATA_BASE_URL)"))
        assertNull(normalizeDataBaseUrl("http://example.com/data/"))
        assertNull(normalizeDataBaseUrl("https:///data/"))
        assertEquals("https://example.com/\$web/data/", normalizeDataBaseUrl(" https://example.com/\$web/data "))
    }

    @Test
    fun freshnessTextMatchesIos() {
        assertEquals("14:30 기준 · 2분 전", Freshness.Normal("14:30", 2).text)
        assertEquals("14:30 기준 · 방금", Freshness.Normal("14:30", 0).text)
        assertEquals("수집 18분 지연 · 14:12 기준", Freshness.Delayed("14:12", 18).text)
        assertEquals("오프라인 · 14:28 저장본", Freshness.Offline("14:28").text)
        assertFalse(Freshness.Normal("14:30", 2).isWarning)
        assertTrue(Freshness.Offline("14:28").isWarning)
    }
}
