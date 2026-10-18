// 공개 데이터 파일 형식(docs/DATA.md). latest.json · days/YYYY-MM-DD.json · calendar.json

public struct LatestZone: Codable, Hashable, Sendable {
    public let id: String
    public let terminal: String?
    public let category: String?
    public let name: String?
    public let order: Int?
    /// 주차 대수. MISSING이면 nil
    public let p: Int?
    /// 운영 면수. 0 = 운영 중단
    public let c: Int?
    public let slot: String?
    public let flags: [String]?

    public init(id: String, terminal: String? = nil, category: String? = nil, name: String? = nil, order: Int? = nil, p: Int?, c: Int?, slot: String? = nil, flags: [String]? = nil) {
        self.id = id
        self.terminal = terminal
        self.category = category
        self.name = name
        self.order = order
        self.p = p
        self.c = c
        self.slot = slot
        self.flags = flags
    }
}

public struct LatestDoc: Codable, Hashable, Sendable {
    public let v: Int?
    /// KST 5분 슬롯 "YYYY-MM-DDTHH:MM"
    public let slot: String
    public let start: String?
    public let ok: Bool?
    public let stale: Bool?
    public let error: String?
    public let generatedAt: String?
    public let lastAttemptAt: String?
    public let lastOkAt: String?
    public let zones: [LatestZone]

    enum CodingKeys: String, CodingKey {
        case v, slot, start, ok, stale, error, zones
        case generatedAt = "generated_at"
        case lastAttemptAt = "last_attempt_at"
        case lastOkAt = "last_ok_at"
    }
}

public struct DayZone: Codable, Hashable, Sendable {
    /// 288칸 주차 대수
    public let p: [Int?]
    /// 288칸 운영 면수
    public let c: [Int?]
    /// 수집 누락을 추정으로 메운 슬롯 인덱스
    public let e: [Int]?

    public init(p: [Int?], c: [Int?], e: [Int]? = nil) {
        self.p = p
        self.c = c
        self.e = e
    }
}

public struct DayDoc: Codable, Hashable, Sendable {
    public let v: Int?
    public let date: String
    public let zones: [String: DayZone]
}

public struct CalendarDoc: Decodable, Hashable, Sendable {
    public let start: String?
    /// 존재하는 날짜
    public let days: Set<String>
    /// 날짜 → 공휴일 이름
    public let holidays: [String: String]

    enum CodingKeys: String, CodingKey { case start, days, holidays }

    private struct Ignored: Decodable {}

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        start = try c.decodeIfPresent(String.self, forKey: .start)
        days = Set(try c.decodeIfPresent([String: Ignored].self, forKey: .days)?.keys ?? [:].keys)
        holidays = try c.decodeIfPresent([String: String].self, forKey: .holidays) ?? [:]
    }
}
