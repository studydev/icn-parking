import Foundation

public struct GroupCell: Hashable, Sendable {
    public let available: Double
    public let occupancy: Double
}

/// 그룹·터미널 합계. 지금 값은 web nowAgg(100% 상한)와 같다.
public struct GroupForecast: Hashable, Sendable {
    /// 합계에 들어간 구역(현재값 있고 면수 > 0)
    public let included: [String]
    /// 운영 중단·현재값 없음으로 빠진 구역 수
    public let missing: Int
    public let capacity: Int
    /// Σc − Σmin(p, c). 포함 구역이 없으면 nil
    public let available: Int?
    /// Σmin(p, c) / Σc
    public let occupancy: Double?
    /// 포함 구역 중 하나라도 예측이 되면 true
    public let hasForecast: Bool
    /// 예측 없는 구역·빈 칸은 현재값을 그대로 더한다(디자인 groupSeries 규칙). hasForecast가 false면 빈 배열
    public let cells: [GroupCell]

    /// zoneIds 순서대로 합산한다. results는 같은 칸 위치로 계산한 구역 예측
    public init(zoneIds: [String], latest: [LatestZone], results: [String: ForecastResult]) {
        var q = 0, c = 0, included: [String] = [], current: [String: (p: Int, c: Int)] = [:]
        for id in zoneIds {
            guard let x = latest.first(where: { $0.id == id }), let p = x.p, let cap = x.c, cap != 0 else { continue }
            q += min(p, cap)
            c += cap
            included.append(id)
            current[id] = (p, cap)
        }
        self.included = included
        missing = zoneIds.count - included.count
        capacity = c
        available = included.isEmpty ? nil : c - q
        occupancy = included.isEmpty ? nil : Double(q) / Double(c)
        hasForecast = included.contains { results[$0]?.forecast != nil }
        cells = !hasForecast ? [] : (0..<6).map { k in
            var sum = 0.0
            for id in included {
                if let a = results[id]?.forecast?.cells[k].available { sum += a } else if let x = current[id] { sum += Double(x.c - min(x.p, x.c)) }
            }
            return GroupCell(available: sum, occupancy: (Double(c) - sum) / Double(c))
        }
    }
}

/// 상단 줄 상태(README States): 오프라인 > 지연(stale 또는 slot이 10분 이상 지남) > 정상
public enum Freshness: Hashable, Sendable {
    /// "14:30 기준 · 2분 전"(0분 = 방금)
    case normal(time: String, minutes: Int)
    /// "수집 18분 지연 · 14:12 기준"
    case delayed(time: String, minutes: Int)
    /// "오프라인 · 14:28 저장본"
    case offline(time: String)

    public static let delayMinutes = 10

    /// slot = latest.json slot("YYYY-MM-DDTHH:MM", KST)
    public static func of(slot: String, stale: Bool, now: Date, offline: Bool) -> Freshness {
        let elapsed = now.timeIntervalSince(ParkingTime.instant(ofKSTSlot: slot))
        let minutes = max(0, Int((elapsed / 60).rounded(.down))), time = String(slot.suffix(5))
        if offline { return .offline(time: time) }
        if stale || minutes >= delayMinutes { return .delayed(time: time, minutes: minutes) }
        return .normal(time: time, minutes: minutes)
    }
}
