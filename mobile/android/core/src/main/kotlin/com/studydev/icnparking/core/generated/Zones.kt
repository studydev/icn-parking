// 생성 파일 — 직접 고치지 마세요.
// 원본: functions/config/zones.yaml + mobile/shared/layout.json · node mobile/shared/scripts/generate.mjs
package com.studydev.icnparking.core.generated

enum class Terminal(val code: String) {
    T1("T1"),
    T2("T2"),
    ;

    companion object {
        fun fromCode(code: String): Terminal? = entries.firstOrNull { it.code == code }
    }
}

/** zones.yaml·latest.json의 category 값 */
enum class ZoneCategory(val label: String) {
    SHORT("단기"),
    LONG("장기"),
    TOWER("타워"),
    RESERVED("예약"),
    ;

    val group: ZoneGroup
        get() = when (this) {
            SHORT -> ZoneGroup.SHORT
            LONG -> ZoneGroup.LONG
            TOWER -> ZoneGroup.LONG
            RESERVED -> ZoneGroup.RESERVED
        }

    companion object {
        fun fromLabel(label: String): ZoneCategory? = entries.firstOrNull { it.label == label }
    }
}

/** 실시간 그룹·히스토리 그룹. inTotal = 터미널 전체 합계에 포함 */
enum class ZoneGroup(val id: String, val label: String, val categories: List<ZoneCategory>, val inTotal: Boolean) {
    SHORT("short", "단기주차장", listOf(ZoneCategory.SHORT), true),
    LONG("long", "장기·주차타워", listOf(ZoneCategory.LONG, ZoneCategory.TOWER), true),
    RESERVED("reserved", "예약주차장", listOf(ZoneCategory.RESERVED), false),
}

data class ZoneDef(
    val id: String,
    val terminal: Terminal,
    val category: ZoneCategory,
    val name: String,
    val shortName: String,
    val order: Int,
    val activeFrom: String,
)

data class ZoneTile(val id: String, val span: Int)

data class TerminalLayout(
    /** 단기 층, 위에서부터 건물 층 순 */
    val floors: List<String>,
    /** 이 층 행 아래에 지면선 */
    val groundAfter: String,
    /** 장기·타워·예약 2열 그리드 순서 */
    val tiles: List<ZoneTile>,
    /** 예측 표·히스토리 칩의 장기·타워 순서 */
    val long: List<String>,
    val reserved: String,
    /** 셔틀 노선 칸 순서(첫 노선 = 기본) */
    val shuttleRoutes: List<String>,
)

object Zones {
    val all: List<ZoneDef> = listOf(
        ZoneDef("t1-short-b1", Terminal.T1, ZoneCategory.SHORT, "단기 지하1층", "B1", 1, "2026-10-01"),
        ZoneDef("t1-short-b2", Terminal.T1, ZoneCategory.SHORT, "단기 지하2층", "B2", 2, "2026-10-01"),
        ZoneDef("t1-short-b3", Terminal.T1, ZoneCategory.SHORT, "단기 지하3층", "B3", 3, "2026-10-01"),
        ZoneDef("t1-short-gf", Terminal.T1, ZoneCategory.SHORT, "단기 지상층", "지상", 4, "2026-10-01"),
        ZoneDef("t1-long-p1", Terminal.T1, ZoneCategory.LONG, "장기 P1", "장기 P1", 5, "2026-10-01"),
        ZoneDef("t1-long-p2", Terminal.T1, ZoneCategory.LONG, "장기 P2", "장기 P2", 6, "2026-10-01"),
        ZoneDef("t1-long-p3", Terminal.T1, ZoneCategory.LONG, "장기 P3", "장기 P3", 7, "2026-10-01"),
        ZoneDef("t1-tower-p1", Terminal.T1, ZoneCategory.TOWER, "주차타워 P1", "P1 타워", 8, "2026-10-01"),
        ZoneDef("t1-tower-p2", Terminal.T1, ZoneCategory.TOWER, "주차타워 P2", "P2 타워", 9, "2026-10-01"),
        ZoneDef("t1-resv-p5", Terminal.T1, ZoneCategory.RESERVED, "예약 P5", "예약 P5", 10, "2026-10-01"),
        ZoneDef("t2-short-bm", Terminal.T2, ZoneCategory.SHORT, "단기 지하M층", "M층", 1, "2026-10-01"),
        ZoneDef("t2-short-1f", Terminal.T2, ZoneCategory.SHORT, "단기 지상1층", "1층", 2, "2026-10-01"),
        ZoneDef("t2-short-2f", Terminal.T2, ZoneCategory.SHORT, "단기 지상2층", "2층", 3, "2026-10-01"),
        ZoneDef("t2-short-3f", Terminal.T2, ZoneCategory.SHORT, "단기 지상3층", "3층", 4, "2026-10-01"),
        ZoneDef("t2-short-4f", Terminal.T2, ZoneCategory.SHORT, "단기 지상4층", "4층", 5, "2026-10-01"),
        ZoneDef("t2-long", Terminal.T2, ZoneCategory.LONG, "장기주차장", "장기", 6, "2026-10-01"),
        ZoneDef("t2-tower-p1", Terminal.T2, ZoneCategory.TOWER, "주차타워 P1", "P1 타워", 7, "2026-10-01"),
        ZoneDef("t2-tower-p2", Terminal.T2, ZoneCategory.TOWER, "주차타워 P2", "P2 타워", 8, "2026-10-01"),
        ZoneDef("t2-resv", Terminal.T2, ZoneCategory.RESERVED, "예약주차장", "예약", 9, "2026-10-01"),
    )

    val byId: Map<String, ZoneDef> = all.associateBy { it.id }

    fun zones(terminal: Terminal): List<ZoneDef> = all.filter { it.terminal == terminal }

    fun layout(terminal: Terminal): TerminalLayout = when (terminal) {
        Terminal.T1 -> TerminalLayout(
            floors = listOf("t1-short-gf", "t1-short-b1", "t1-short-b2", "t1-short-b3"),
            groundAfter = "t1-short-gf",
            tiles = listOf(ZoneTile("t1-tower-p2", 1), ZoneTile("t1-tower-p1", 1), ZoneTile("t1-long-p2", 1), ZoneTile("t1-long-p1", 1), ZoneTile("t1-resv-p5", 1), ZoneTile("t1-long-p3", 1)),
            long = listOf("t1-tower-p1", "t1-tower-p2", "t1-long-p1", "t1-long-p2", "t1-long-p3"),
            reserved = "t1-resv-p5",
            shuttleRoutes = listOf("01", "02", "03", "04", "05"),
        )
        Terminal.T2 -> TerminalLayout(
            floors = listOf("t2-short-4f", "t2-short-3f", "t2-short-2f", "t2-short-1f", "t2-short-bm"),
            groundAfter = "t2-short-1f",
            tiles = listOf(ZoneTile("t2-resv", 2), ZoneTile("t2-long", 2), ZoneTile("t2-tower-p1", 1), ZoneTile("t2-tower-p2", 1)),
            long = listOf("t2-long", "t2-tower-p1", "t2-tower-p2"),
            reserved = "t2-resv",
            shuttleRoutes = listOf("02", "01", "03", "04", "05"),
        )
    }
}
