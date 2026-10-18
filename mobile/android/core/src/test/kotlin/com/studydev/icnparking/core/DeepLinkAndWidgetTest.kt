package com.studydev.icnparking.core

import com.studydev.icnparking.core.generated.Terminal
import com.studydev.icnparking.core.generated.ZoneGroup
import com.studydev.icnparking.core.presentation.DeepLink
import com.studydev.icnparking.core.presentation.NumberText
import com.studydev.icnparking.core.presentation.ParkingSnapshot
import com.studydev.icnparking.core.presentation.SheetTarget
import com.studydev.icnparking.core.presentation.SheetTargets
import com.studydev.icnparking.core.presentation.WidgetModels
import com.studydev.icnparking.core.presentation.id
import com.studydev.icnparking.core.presentation.title
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DeepLinkAndWidgetTest {
    @Test
    fun deepLinksRoundTrip() {
        val links = listOf(
            DeepLink.Zone("t1-short-b1"), DeepLink.Group(Terminal.T2, ZoneGroup.LONG), DeepLink.Total(Terminal.T1),
            DeepLink.Forecast(Terminal.T2), DeepLink.Shuttle("01", "D00017"), DeepLink.Shuttle("03", null),
        )
        for (link in links) assertEquals(link.url, link, DeepLink.parse(link.url))
        assertEquals(DeepLink.Zone("t1-short-b1"), DeepLink.parse("icnparking://zone/t1-short-b1"))
        assertEquals(DeepLink.Shuttle("01", "D00017"), DeepLink.parse("icnparking://shuttle/01/D00017"))
        assertNull(DeepLink.parse("icnparking://zone/nope"))
        assertNull(DeepLink.parse("https://zone/t1-short-b1"))
        assertNull(DeepLink.parse("icnparking://group/T3/short"))
        assertEquals(Terminal.T2, DeepLink.Zone("t2-long").screenTerminal)
        // iOS와 같은 URL 모양
        assertEquals("icnparking://group/T2/long", DeepLink.Group(Terminal.T2, ZoneGroup.LONG).url)
    }

    @Test
    fun widgetChoicesAndIds() {
        val choices = SheetTargets.widgetChoices
        assertEquals(2 + 6 + 19, choices.size)
        assertEquals("T1 전체", choices.first().title)
        for (c in choices) assertEquals(c.id, c, SheetTargets.fromId(c.id))
        assertEquals("T1 단기주차장", SheetTarget.Group(Terminal.T1, ZoneGroup.SHORT).title)
        assertEquals("T1 단기 지하1층", SheetTarget.Zone("t1-short-b1").title)
        assertEquals("g:T1:short", SheetTarget.Group(Terminal.T1, ZoneGroup.SHORT).id)
    }

    @Test
    fun widgetModelsFollowForecast() {
        val fx = Fixtures.load<ForecastFixture>("fixtures/forecast/normal.json")
        val s = ParkingSnapshot(fx.latest, fx.days, now = fx.kst)
        val small = WidgetModels.small(s, SheetTarget.Zone("t1-short-b1"), 2)
        val want = fx.expected.zones.getValue("t1-short-b1")
        assertEquals("T1 단기 지하1층", small.title)
        assertEquals(want.nowAvailable, small.available)
        assertEquals(NumberText.round(want.cells[1].available!!) - want.nowAvailable!!, small.deltaHour)
        assertEquals("2분 전 기준", small.ago)
        assertEquals(DeepLink.Zone("t1-short-b1"), small.link)
        val group = WidgetModels.small(s, SheetTarget.Group(Terminal.T1, ZoneGroup.SHORT), 0)
        assertEquals(fx.expected.groups.getValue("short").available, group.available)
        assertEquals("방금 기준", group.ago)
        val medium = WidgetModels.medium(s, Terminal.T1, 2)
        assertEquals("T1 주차 · 1·2·3시간 뒤", medium.title)
        assertEquals(listOf("단기주차장", "장기·주차타워"), medium.rows.map { it.name })
        assertEquals(listOf("15:30", "16:30", "17:30"), medium.rows[0].cells.map { it.time })
        assertEquals(fx.expected.groups.getValue("short").available, medium.rows[0].available)
        assertEquals(NumberText.round(fx.expected.groups.getValue("short").cells[1].available), medium.rows[0].cells[0].available)
        assertEquals(DeepLink.Forecast(Terminal.T1), medium.link)
    }
}
