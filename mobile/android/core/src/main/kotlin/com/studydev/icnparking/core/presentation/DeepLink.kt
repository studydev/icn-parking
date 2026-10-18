package com.studydev.icnparking.core.presentation

import com.studydev.icnparking.core.generated.Strings
import com.studydev.icnparking.core.generated.Terminal
import com.studydev.icnparking.core.generated.ZoneGroup
import com.studydev.icnparking.core.generated.Zones

/**
 * icnparking:// 딥링크. 가이드: icnparking://zone/{id}, icnparking://shuttle/{route}/{stop}
 * 위젯용으로 group/{T1}/{short|long|reserved}, total/{T1}, forecast/{T1}도 받는다. iOS DeepLink와 같은 규칙.
 * android.net.Uri 없이 문자열로 파싱해 JVM 단위 테스트에서도 그대로 쓴다.
 */
sealed interface DeepLink {
    data class Zone(val id: String) : DeepLink
    data class Group(val terminal: Terminal, val group: ZoneGroup) : DeepLink
    data class Total(val terminal: Terminal) : DeepLink
    data class Forecast(val terminal: Terminal) : DeepLink
    data class Shuttle(val route: String, val stop: String?) : DeepLink

    val url: String
        get() = "$SCHEME://" + when (this) {
            is Zone -> "zone/$id"
            is Group -> "group/${terminal.code}/${group.id}"
            is Total -> "total/${terminal.code}"
            is Forecast -> "forecast/${terminal.code}"
            is Shuttle -> "shuttle/$route" + (stop?.let { "/$it" } ?: "")
        }

    /** 열 시트(구역·그룹·전체 링크) */
    val sheetTarget: SheetTarget?
        get() = when (this) {
            is Zone -> SheetTarget.Zone(id)
            is Group -> SheetTarget.Group(terminal, group)
            is Total -> SheetTarget.Total(terminal)
            is Forecast, is Shuttle -> null
        }

    /** 화면 터미널을 바꿔야 하면 그 터미널 */
    val screenTerminal: Terminal?
        get() = when (this) {
            is Zone -> Zones.byId[id]?.terminal
            is Group -> terminal
            is Total -> terminal
            is Forecast -> terminal
            is Shuttle -> null
        }

    companion object {
        const val SCHEME = "icnparking"

        fun parse(url: String?): DeepLink? {
            val prefix = "$SCHEME://"
            if (url == null || !url.startsWith(prefix, ignoreCase = true)) return null
            val parts = url.substring(prefix.length).substringBefore('?').substringBefore('#').split('/').filter { it.isNotEmpty() }
            if (parts.isEmpty()) return null
            val t = parts.getOrNull(1)?.let(Terminal::fromCode)
            return when {
                parts[0] == "zone" && parts.size == 2 && Zones.byId.containsKey(parts[1]) -> Zone(parts[1])
                parts[0] == "group" && parts.size == 3 && t != null -> ZoneGroup.entries.firstOrNull { it.id == parts[2] }?.let { Group(t, it) }
                parts[0] == "total" && parts.size == 2 && t != null -> Total(t)
                parts[0] == "forecast" && parts.size == 2 && t != null -> Forecast(t)
                parts[0] == "shuttle" && parts.size in 2..3 -> Shuttle(parts[1], parts.getOrNull(2))
                else -> null
            }
        }
    }
}

/** 위젯·설정 목록 제목: "T1 전체", "T1 단기주차장", "T1 단기 지하1층" */
val SheetTarget.title: String
    get() = when (this) {
        is SheetTarget.Zone -> Zones.byId[id]?.let { "${it.terminal.code} ${it.name}" } ?: id
        is SheetTarget.Group -> "${terminal.code} ${group.label}"
        is SheetTarget.Total -> Strings.Forecast.totalA11y(terminal.code)
    }

val SheetTarget.deepLink: DeepLink
    get() = when (this) {
        is SheetTarget.Zone -> DeepLink.Zone(id)
        is SheetTarget.Group -> DeepLink.Group(terminal, group)
        is SheetTarget.Total -> DeepLink.Total(terminal)
    }

/** 저장용 id: zone id · "g:T1:short" · "t:T1" (iOS SheetTarget.id와 같다) */
val SheetTarget.id: String
    get() = when (this) {
        is SheetTarget.Zone -> id
        is SheetTarget.Group -> "g:${terminal.code}:${group.id}"
        is SheetTarget.Total -> "t:${terminal.code}"
    }

object SheetTargets {
    fun fromId(id: String): SheetTarget? {
        val p = id.split(':')
        return when {
            p.size == 1 && Zones.byId.containsKey(id) -> SheetTarget.Zone(id)
            p.size == 2 && p[0] == "t" -> Terminal.fromCode(p[1])?.let { SheetTarget.Total(it) }
            p.size == 3 && p[0] == "g" -> {
                val t = Terminal.fromCode(p[1])
                val g = ZoneGroup.entries.firstOrNull { it.id == p[2] }
                if (t != null && g != null) SheetTarget.Group(t, g) else null
            }
            else -> null
        }
    }

    /** 위젯 설정에서 고를 수 있는 곳: 터미널 전체 → 그룹 → 구역(터미널 순) */
    val widgetChoices: List<SheetTarget>
        get() = Terminal.entries.flatMap { t ->
            listOf<SheetTarget>(SheetTarget.Total(t)) + ZoneGroup.entries.map { SheetTarget.Group(t, it) } + Zones.zones(t).map { SheetTarget.Zone(it.id) }
        }
}
