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
        // 중: 3시간 그래프(지금 + 30분 점 6개)
        val graph = WidgetModels.graph(s, SheetTarget.Zone("t1-short-b1"), 2)
        assertEquals(listOf("지금", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"), graph.points.map { it.label })
        assertEquals(want.nowAvailable, graph.points[0].available)
        assertEquals(NumberText.round(want.cells[5].available!!), graph.points[6].available)
        assertEquals(DeepLink.Zone("t1-short-b1"), graph.link)
        // 대: 묶음 전체 + 주차장별, 지금 · 1·2·3시간 뒤
        val table = WidgetModels.table(s, Terminal.T1, ZoneGroup.SHORT, 2)
        assertEquals("T1 단기주차장", table.title)
        assertEquals(listOf("15:30", "16:30", "17:30"), table.times)
        assertEquals(listOf("전체", "지상", "B1", "B2", "B3"), table.rows.map { it.name })
        assertEquals(fx.expected.groups.getValue("short").available, table.rows[0].available)
        assertEquals(NumberText.round(fx.expected.groups.getValue("short").cells[1].available), table.rows[0].cells[0].available)
        assertEquals(NumberText.round(want.cells[5].available!!), table.rows[2].cells[2].available)
        assertEquals(DeepLink.Forecast(Terminal.T1), table.link)
        assertEquals(listOf("예약 P5"), WidgetModels.table(s, Terminal.T1, ZoneGroup.RESERVED, 2).rows.map { it.name })
    }
}
