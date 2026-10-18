import Foundation

/// 실시간·예측 숫자 단위(헤더 토글)
public enum DisplayUnit: String, CaseIterable, Sendable {
    case available = "avail"
    case occupancy = "occ"
}

/// 구역 지금 값(latest.json). 운영 중단 = c == 0, 현재값 없음 = p 또는 c 없음
public struct ZoneNow: Hashable, Sendable {
    public let id: String
    public let capacity: Int?
    public let parking: Int?

    public init(id: String, latest: LatestZone?) {
        self.id = id
        capacity = latest?.c
        parking = latest?.p
    }

    public var closed: Bool { capacity == 0 }
    public var missing: Bool { !closed && (parking == nil || capacity == nil || capacity! < 0) }
    /// 숫자를 보여 줄 수 없음(운영 중단·확인 필요)
    public var dead: Bool { closed || missing }

    public var available: Int? {
        guard !dead, let p = parking, let c = capacity else { return nil }
        return max(c - p, 0)
    }

    public var occupancy: Double? {
        guard !dead, let p = parking, let c = capacity else { return nil }
        return min(Double(p) / Double(c), 1)
    }

    public var isFull: Bool { (occupancy ?? 0) >= Tokens.fullThreshold }

    /// 숫자 대신 보여 줄 말(운영 중단 · 확인 필요 · 만차)
    public var word: String? {
        if closed { return Strings.Zone.closed }
        if missing { return Strings.Zone.missing }
        return isFull ? Strings.Zone.full : nil
    }
}

/// 상세 시트 대상
public enum SheetTarget: Hashable, Sendable, Identifiable {
    case zone(String)
    case group(Terminal, ZoneGroup)
    /// 터미널 전체(예약 제외)
    case total(Terminal)

    public var id: String {
        switch self {
        case .zone(let id): return id
        case .group(let t, let g): return "g:\(t.rawValue):\(g.rawValue)"
        case .total(let t): return "t:\(t.rawValue)"
        }
    }
}

/// 화면이 쓰는 데이터 한 벌. 예측·합계·시트·히스토리는 모두 여기서 계산한다.
public struct ParkingSnapshot: Sendable {
    public let latest: LatestDoc
    public let days: [String: DayDoc]
    public let holidays: [String: String]
    /// 지금 KST 날짜·슬롯(기기 시각 기준, 웹 D.now와 같음)
    public let now: SlotTime

    public init(latest: LatestDoc, days: [String: DayDoc], holidays: [String: String] = [:], now: SlotTime) {
        self.latest = latest
        self.days = days
        self.holidays = holidays
        self.now = now
    }

    public var engine: ForecastEngine { ForecastEngine(days: days, latest: latest.zones, now: now) }

    public func zoneNow(_ id: String) -> ZoneNow { ZoneNow(id: id, latest: latest.zones.first { $0.id == id }) }

    /// 터미널 구역 id(zones.yaml 순서). groups가 비면 전체
    public func zoneIds(_ terminal: Terminal, _ groups: [ZoneGroup] = ZoneGroup.allCases) -> [String] {
        Zones.zones(terminal).filter { groups.contains($0.category.group) }.map(\.id)
    }

    public func zoneIds(_ target: SheetTarget) -> [String] {
        switch target {
        case .zone(let id): return [id]
        case .group(let t, let g): return zoneIds(t, [g])
        case .total(let t): return zoneIds(t, ZoneGroup.allCases.filter(\.inTotal))
        }
    }

    /// 터미널 구역별 30분 칸 예측
    public func forecasts(_ terminal: Terminal) -> [String: ForecastResult] {
        let engine = self.engine
        return Dictionary(uniqueKeysWithValues: zoneIds(terminal).map { ($0, engine.zone($0)) })
    }

    public func group(_ target: SheetTarget, results: [String: ForecastResult] = [:]) -> GroupForecast {
        GroupForecast(zoneIds: zoneIds(target), latest: latest.zones, results: results)
    }

    /// 예측에 필요한 날짜 파일: 오늘·어제(기준점 되짚기), 1~4주 전 같은 요일과 앞뒤 하루(±2슬롯·자정 넘김)
    public static func forecastDates(today: String) -> [String] {
        var dates = [today, LocalDate.addDays(today, -1)]
        for w in 1...4 { for k in -1...1 { dates.append(LocalDate.addDays(today, -7 * w + k)) } }
        return dates
    }
}

/// 숫자 문구. 기기 언어와 상관없이 디자인과 같은 모양(1,234 · ▲12 · ▼3 · ±0)
public enum NumberText {
    /// JS Math.round와 같은 반올림
    public static func round(_ v: Double) -> Int { Int((v + 0.5).rounded(.down)) }

    /// 묶음 쉼표(디자인 H.fmt = toLocaleString('ko-KR'))
    public static func grouped(_ v: Double) -> String { grouped(round(v)) }

    public static func grouped(_ n: Int) -> String {
        let digits = String(abs(n))
        var out = ""
        for (i, ch) in digits.enumerated() {
            if i > 0, (digits.count - i) % 3 == 0 { out.append(",") }
            out.append(ch)
        }
        return n < 0 ? "-" + out : out
    }

    /// 쉼표 없는 정수(예측 표 칸)
    public static func plain(_ v: Double) -> String { String(round(v)) }

    public static func percent(_ occupancy: Double) -> String { String(round(occupancy * 100)) }

    public static func delta(_ d: Int) -> String {
        d < 0 ? Strings.Forecast.deltaDown(amount: grouped(-d)) : d > 0 ? Strings.Forecast.deltaUp(amount: grouped(d)) : Strings.Forecast.deltaZero
    }

    /// 접근성 "9대 감소"
    public static func change(_ d: Int) -> String {
        d < 0 ? Strings.Forecast.changeDown(cars: grouped(-d)) : d > 0 ? Strings.Forecast.changeUp(cars: grouped(d)) : Strings.Forecast.changeNone
    }

    /// "M/D"
    public static func monthDay(_ date: String) -> String {
        let p = date.split(separator: "-").compactMap { Int($0) }
        return "\(p[1])/\(p[2])"
    }
}
