/// 예측 칸 위치. 칸 하나의 계산은 웹 forecastOf와 같고 위치만 다르다.
public enum CellSchedule: Sendable {
    /// 앱: 지금 슬롯 + 30분씩 6칸(+30분 … +3시간)
    case halfHourly
    /// 웹 forecastOf: 다음 정시부터 1시간씩 6칸
    case webHourly

    func slots(after idx: Int) -> [Int] {
        switch self {
        case .halfHourly: return (1...6).map { idx + 6 * $0 }
        case .webHourly: return (0..<6).map { (idx / 12 + 1 + $0) * 12 }
        }
    }
}

/// 예측을 만들 수 없는 이유. 웹 forecastOf·capacityPredictionIssue의 실패 문구와 1:1
public enum ForecastFailure: Hashable, Sendable {
    /// 기준점을 찾는 동안 면수 0 관측 — "최근 관측이 운영 중단 상태입니다."
    case recentClosed
    /// latest 면수 0 — "현재 운영 중단 구역입니다."
    case latestClosed
    /// latest 면수 없음 — "현재 운영 면수를 확인할 수 없어 …"
    case capacityUnknown
    /// latest 면수 ≠ 기준점 면수 — "최신 면수와 예측 기준 면수가 달라 …"
    case capacityChanged(from: Int, to: Int)
    /// 최근 30분 실측 없음 — "지금 값이 없어 추정할 수 없습니다"
    case noCurrent
    /// 1~4주 전 같은 요일·시각 기록 없음
    case noHistory
}

/// 기준점(지금 또는 최대 30분 전 실측)
public struct CurrentValue: Hashable, Sendable {
    public let anchor: SlotTime
    public let capacity: Int
    public let parking: Int
    public var available: Int { max(capacity - parking, 0) }
    public var occupancy: Double { min(Double(parking) / Double(capacity), 1) }
}

public struct ForecastCell: Hashable, Sendable {
    /// 예측 시각(오늘 기준, 자정을 넘으면 다음 날)
    public let time: SlotTime
    /// 예상 주차 대수. 비교일 기록이 없으면 nil
    public let parking: Double?
    /// 비교일 같은 시각 주차 대수(±2슬롯 실측 평균)
    public let baseParking: Double?
    public let capacity: Int
    public var available: Double? { parking.map { max(Double(capacity) - $0, 0) } }
    public var occupancy: Double? { parking.map { min($0 / Double(capacity), 1) } }
}

public struct ZoneForecast: Hashable, Sendable {
    public let current: CurrentValue
    /// 1~4: 몇 주 전 같은 요일을 썼는지
    public let weeksBack: Int
    public let compareDate: String
    public let baseParking: Double
    /// 지금 대수 − 비교일 같은 시각 대수
    public let offset: Double
    public let cells: [ForecastCell]
}

public enum ForecastResult: Hashable, Sendable {
    case available(ZoneForecast)
    case unavailable(ForecastFailure, current: CurrentValue?)

    public var forecast: ZoneForecast? {
        if case .available(let f) = self { return f }
        return nil
    }
}

/// web/app.js forecastOf 이식. 1~4주 전 같은 요일·시각 주차 대수(±2슬롯 실측 평균)에 "지금 − 그때" 차이를 더하고 현재 운영 면수로 환산한다.
public struct ForecastEngine: Sendable {
    public let days: [String: DayDoc]
    public let latest: [LatestZone]
    /// 지금 KST 날짜·슬롯
    public let now: SlotTime

    public init(days: [String: DayDoc], latest: [LatestZone], now: SlotTime) {
        self.days = days
        self.latest = latest
        self.now = now
    }

    public func zone(_ zoneId: String, schedule: CellSchedule = .halfHourly) -> ForecastResult {
        var anchor: (time: SlotTime, zone: DayZone)?
        for back in 0...6 {
            let at = ParkingTime.slotRange(now.date, now.slot - back), z = dayZone(at.date, zoneId)
            if let z, value(z.c, at.slot) == 0 { return .unavailable(.recentClosed, current: nil) }
            if let z, measured(z, at.slot) != nil { anchor = (at, z); break }
        }
        guard let anchor, let capacity = value(anchor.zone.c, anchor.time.slot), let parking = self.parking(anchor.zone, anchor.time.slot) else {
            return .unavailable(.noCurrent, current: nil)
        }
        if let issue = capacityIssue(zoneId, capacity) { return .unavailable(issue, current: nil) }
        let current = CurrentValue(anchor: anchor.time, capacity: capacity, parking: parking)

        for w in 1...4 {
            let compareDate = LocalDate.addDays(now.date, -7 * w)
            guard let baseParking = smoothed(zoneId, LocalDate.addDays(anchor.time.date, -7 * w), anchor.time.slot) else { continue }
            let offset = Double(parking) - baseParking
            let cells = schedule.slots(after: now.slot).map { j -> ForecastCell in
                let at = ParkingTime.slotRange(compareDate, j), bv = smoothed(zoneId, at.date, at.slot)
                return ForecastCell(time: ParkingTime.slotRange(now.date, j), parking: bv.map { max($0 + offset, 0) }, baseParking: bv, capacity: capacity)
            }
            if cells.allSatisfy({ $0.parking == nil }) { continue }
            return .available(ZoneForecast(current: current, weeksBack: w, compareDate: compareDate, baseParking: baseParking, offset: offset, cells: cells))
        }
        return .unavailable(.noHistory, current: current)
    }

    /// web capacityPredictionIssue
    func capacityIssue(_ zoneId: String, _ capacity: Int) -> ForecastFailure? {
        let current = latest.first { $0.id == zoneId }?.c
        if current == 0 { return .latestClosed }
        guard let current, current > 0 else { return .capacityUnknown }
        return current != capacity ? .capacityChanged(from: capacity, to: current) : nil
    }

    /// web forecastOf sm: 지금 이전의 ±2슬롯 실측 평균
    func smoothed(_ zoneId: String, _ date: String, _ slot: Int) -> Double? {
        var sum = 0.0, n = 0
        for delta in -2...2 {
            let at = ParkingTime.slotRange(date, slot + delta)
            guard at.date < now.date || (at.date == now.date && at.slot <= now.slot) else { continue }
            if let z = dayZone(at.date, zoneId), let v = measured(z, at.slot) { sum += Double(v); n += 1 }
        }
        return n > 0 ? sum / Double(n) : nil
    }

    func dayZone(_ date: String, _ zoneId: String) -> DayZone? { days[date]?.zones[zoneId] }

    func value(_ array: [Int?], _ i: Int) -> Int? { i >= 0 && i < array.count ? array[i] : nil }

    /// web zoneDay p: 주차 대수와 면수(>0)가 모두 있을 때만
    func parking(_ z: DayZone, _ i: Int) -> Int? {
        guard let p = value(z.p, i), let c = value(z.c, i), c > 0 else { return nil }
        return p
    }

    /// web zoneDay pm: 보정 슬롯(e) 제외한 실측
    func measured(_ z: DayZone, _ i: Int) -> Int? {
        z.e?.contains(i) == true ? nil : parking(z, i)
    }
}
