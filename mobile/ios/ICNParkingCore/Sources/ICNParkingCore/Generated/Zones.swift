// 생성 파일 — 직접 고치지 마세요.
// 원본: functions/config/zones.yaml + mobile/shared/layout.json · node mobile/shared/scripts/generate.mjs

public enum Terminal: String, CaseIterable, Sendable {
    case t1 = "T1"
    case t2 = "T2"
}

/// zones.yaml·latest.json의 category 값
public enum ZoneCategory: String, CaseIterable, Sendable {
    case short = "단기"
    case long = "장기"
    case tower = "타워"
    case reserved = "예약"

    public var group: ZoneGroup {
        switch self {
        case .short: return .short
        case .long: return .long
        case .tower: return .long
        case .reserved: return .reserved
        }
    }
}

/// 실시간 그룹·히스토리 그룹. inTotal = 터미널 전체 합계에 포함
public enum ZoneGroup: String, CaseIterable, Sendable {
    case short, long, reserved

    public var label: String {
        switch self {
        case .short: return "단기주차장"
        case .long: return "장기·주차타워"
        case .reserved: return "예약주차장"
        }
    }

    public var categories: [ZoneCategory] {
        switch self {
        case .short: return [.short]
        case .long: return [.long, .tower]
        case .reserved: return [.reserved]
        }
    }

    public var inTotal: Bool {
        switch self {
        case .short: return true
        case .long: return true
        case .reserved: return false
        }
    }
}

public struct ZoneDef: Hashable, Sendable {
    public let id: String
    public let terminal: Terminal
    public let category: ZoneCategory
    public let name: String
    public let shortName: String
    public let order: Int
    public let activeFrom: String
}

public struct ZoneTile: Hashable, Sendable {
    public let id: String
    public let span: Int
}

public struct TerminalLayout: Hashable, Sendable {
    /// 단기 층, 위에서부터 건물 층 순
    public let floors: [String]
    /// 이 층 행 아래에 지면선
    public let groundAfter: String
    /// 장기·타워·예약 2열 그리드 순서
    public let tiles: [ZoneTile]
    /// 예측 표·히스토리 칩의 장기·타워 순서
    public let long: [String]
    public let reserved: String
    /// 셔틀 노선 칸 순서(첫 노선 = 기본)
    public let shuttleRoutes: [String]
}

public enum Zones {
    public static let all: [ZoneDef] = [
        ZoneDef(id: "t1-short-b1", terminal: .t1, category: .short, name: "단기 지하1층", shortName: "B1", order: 1, activeFrom: "2026-10-01"),
        ZoneDef(id: "t1-short-b2", terminal: .t1, category: .short, name: "단기 지하2층", shortName: "B2", order: 2, activeFrom: "2026-10-01"),
        ZoneDef(id: "t1-short-b3", terminal: .t1, category: .short, name: "단기 지하3층", shortName: "B3", order: 3, activeFrom: "2026-10-01"),
        ZoneDef(id: "t1-short-gf", terminal: .t1, category: .short, name: "단기 지상층", shortName: "지상", order: 4, activeFrom: "2026-10-01"),
        ZoneDef(id: "t1-long-p1", terminal: .t1, category: .long, name: "장기 P1", shortName: "장기 P1", order: 5, activeFrom: "2026-10-01"),
        ZoneDef(id: "t1-long-p2", terminal: .t1, category: .long, name: "장기 P2", shortName: "장기 P2", order: 6, activeFrom: "2026-10-01"),
        ZoneDef(id: "t1-long-p3", terminal: .t1, category: .long, name: "장기 P3", shortName: "장기 P3", order: 7, activeFrom: "2026-10-01"),
        ZoneDef(id: "t1-tower-p1", terminal: .t1, category: .tower, name: "주차타워 P1", shortName: "P1 타워", order: 8, activeFrom: "2026-10-01"),
        ZoneDef(id: "t1-tower-p2", terminal: .t1, category: .tower, name: "주차타워 P2", shortName: "P2 타워", order: 9, activeFrom: "2026-10-01"),
        ZoneDef(id: "t1-resv-p5", terminal: .t1, category: .reserved, name: "예약 P5", shortName: "예약 P5", order: 10, activeFrom: "2026-10-01"),
        ZoneDef(id: "t2-short-bm", terminal: .t2, category: .short, name: "단기 지하M층", shortName: "M층", order: 1, activeFrom: "2026-10-01"),
        ZoneDef(id: "t2-short-1f", terminal: .t2, category: .short, name: "단기 지상1층", shortName: "1층", order: 2, activeFrom: "2026-10-01"),
        ZoneDef(id: "t2-short-2f", terminal: .t2, category: .short, name: "단기 지상2층", shortName: "2층", order: 3, activeFrom: "2026-10-01"),
        ZoneDef(id: "t2-short-3f", terminal: .t2, category: .short, name: "단기 지상3층", shortName: "3층", order: 4, activeFrom: "2026-10-01"),
        ZoneDef(id: "t2-short-4f", terminal: .t2, category: .short, name: "단기 지상4층", shortName: "4층", order: 5, activeFrom: "2026-10-01"),
        ZoneDef(id: "t2-long", terminal: .t2, category: .long, name: "장기주차장", shortName: "장기", order: 6, activeFrom: "2026-10-01"),
        ZoneDef(id: "t2-tower-p1", terminal: .t2, category: .tower, name: "주차타워 P1", shortName: "P1 타워", order: 7, activeFrom: "2026-10-01"),
        ZoneDef(id: "t2-tower-p2", terminal: .t2, category: .tower, name: "주차타워 P2", shortName: "P2 타워", order: 8, activeFrom: "2026-10-01"),
        ZoneDef(id: "t2-resv", terminal: .t2, category: .reserved, name: "예약주차장", shortName: "예약", order: 9, activeFrom: "2026-10-01")
    ]

    public static let byId: [String: ZoneDef] = Dictionary(uniqueKeysWithValues: all.map { ($0.id, $0) })

    public static func zones(_ terminal: Terminal) -> [ZoneDef] { all.filter { $0.terminal == terminal } }

    public static func layout(_ terminal: Terminal) -> TerminalLayout {
        switch terminal {
        case .t1:
            return TerminalLayout(
                floors: ["t1-short-gf", "t1-short-b1", "t1-short-b2", "t1-short-b3"],
                groundAfter: "t1-short-gf",
                tiles: [ZoneTile(id: "t1-tower-p2", span: 1), ZoneTile(id: "t1-tower-p1", span: 1), ZoneTile(id: "t1-long-p2", span: 1), ZoneTile(id: "t1-long-p1", span: 1), ZoneTile(id: "t1-resv-p5", span: 1), ZoneTile(id: "t1-long-p3", span: 1)],
                long: ["t1-tower-p1", "t1-tower-p2", "t1-long-p1", "t1-long-p2", "t1-long-p3"],
                reserved: "t1-resv-p5",
                shuttleRoutes: ["01", "02", "03", "04", "05"]
            )
        case .t2:
            return TerminalLayout(
                floors: ["t2-short-4f", "t2-short-3f", "t2-short-2f", "t2-short-1f", "t2-short-bm"],
                groundAfter: "t2-short-1f",
                tiles: [ZoneTile(id: "t2-resv", span: 2), ZoneTile(id: "t2-long", span: 2), ZoneTile(id: "t2-tower-p1", span: 1), ZoneTile(id: "t2-tower-p2", span: 1)],
                long: ["t2-long", "t2-tower-p1", "t2-tower-p2"],
                reserved: "t2-resv",
                shuttleRoutes: ["02", "01", "03", "04", "05"]
            )
        }
    }
}
