// 셔틀 시간표(mobile/shared/shuttle.json = web/shuttle.json)와 web/shuttle.js shPrep·shNext 이식

public struct ShuttleTravel: Codable, Hashable, Sendable {
    public let sourceUrl: String?
    /// 한 바퀴(순환) 또는 끝까지(편도) 분
    public let total: Int
    /// 승강장 id → 첫 승강장부터 누적 분
    public let elapsed: [String: Int]

    enum CodingKeys: String, CodingKey {
        case total, elapsed
        case sourceUrl = "source_url"
    }
}

public struct ShuttleStop: Codable, Hashable, Sendable {
    public let id: String
    public let label: String
    public let official: String?
    public let note: String
    /// "HH:MM"(24 이상 = 자정 후), 끝 * = 표시편
    public let t: [String]
    /// 표시편 설명("국제업무단지까지만 운행")
    public let mark: String?
}

public struct ShuttleRoute: Codable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let desc: String
    public let terminals: [String]
    public let loop: Bool
    public let headway: String
    public let hours: String
    public let duration: String
    public let url: String?
    public let defaultStop: String
    public let travel: ShuttleTravel?
    public let stops: [ShuttleStop]
    /// 편도 노선 끝 다음 구간 안내
    public let after: String?

    enum CodingKeys: String, CodingKey {
        case id, name, desc, terminals, loop, headway, hours, duration, url, travel, stops, after
        case defaultStop = "default"
    }
}

public struct ShuttleDoc: Codable, Hashable, Sendable {
    public let v: Int?
    public let asOf: String
    public let routes: [ShuttleRoute]

    enum CodingKeys: String, CodingKey {
        case v, routes
        case asOf = "as_of"
    }
}

public enum ShuttleError: Error, Equatable {
    case invalidTravel(route: String)
    case invalidTime(stop: String, value: String)
}

public struct Departure: Hashable, Sendable {
    /// 운행일 기준 분(자정 후 = 1440 이상)
    public let minutes: Int
    /// 하루 안의 분(minutes % 1440)
    public let minuteOfDay: Int
    public let marked: Bool
    /// 시간표 안 순서
    public let index: Int
}

public struct UpcomingDeparture: Hashable, Sendable {
    public let departure: Departure
    /// 남은 분(내림)
    public let wait: Int
    /// 오늘 남은 출발이 없어 내일 시간표에서 고름
    public let tomorrow: Bool
}

public struct PreparedStop: Hashable, Sendable {
    public let stop: ShuttleStop
    public let departures: [Departure]
    /// 하루 안의 분 순. 같은 분이면 시간표 순(JS 안정 정렬과 같게)
    public let sorted: [Departure]

    /// web shNext: 지금(KST 초)보다 엄격히 뒤인 출발 n개, 오늘 없으면 내일로
    public func next(_ n: Int, nowSeconds: Int) -> [UpcomingDeparture] {
        var out: [UpcomingDeparture] = []
        for day in 0..<2 where out.count < n {
            for d in sorted {
                let at = (d.minuteOfDay + day * 1440) * 60
                guard at > nowSeconds else { continue }
                out.append(UpcomingDeparture(departure: d, wait: (at - nowSeconds) / 60, tomorrow: day > 0))
                if out.count >= n { break }
            }
        }
        return out
    }
}

public struct PreparedRoute: Hashable, Sendable {
    public let route: ShuttleRoute
    public let stops: [PreparedStop]
}

/// web shPrep: 시각을 분으로 바꾸고 구간 소요시간을 검증한다
public struct ShuttleSchedule: Hashable, Sendable {
    public let asOf: String
    public let routes: [PreparedRoute]

    public init(_ doc: ShuttleDoc) throws {
        asOf = doc.asOf
        routes = try doc.routes.map(Self.prepare)
    }

    public func route(_ id: String) -> PreparedRoute? { routes.first { $0.id == id } }

    static func prepare(_ route: ShuttleRoute) throws -> PreparedRoute {
        if let travel = route.travel {
            let elapsed = route.stops.map { travel.elapsed[$0.id] }
            let increasing = elapsed.indices.allSatisfy { i in
                guard let v = elapsed[i] else { return false }
                return i == 0 || (elapsed[i - 1].map { v > $0 } ?? false)
            }
            guard elapsed.first == 0, increasing, let last = elapsed.last ?? nil, travel.total > last else {
                throw ShuttleError.invalidTravel(route: route.name)
            }
        }
        let stops = try route.stops.map { stop -> PreparedStop in
            let departures = try stop.t.enumerated().map { index, text -> Departure in
                let chars = Array(text)
                guard chars.count >= 5, chars[2] == ":", let h = Int(String(chars[0...1])), let m = Int(String(chars[3...4])) else {
                    throw ShuttleError.invalidTime(stop: stop.id, value: text)
                }
                let minutes = h * 60 + m
                return Departure(minutes: minutes, minuteOfDay: minutes % 1440, marked: text.hasSuffix("*"), index: index)
            }
            let sorted = departures.sorted { ($0.minuteOfDay, $0.index) < ($1.minuteOfDay, $1.index) }
            return PreparedStop(stop: stop, departures: departures, sorted: sorted)
        }
        return PreparedRoute(route: route, stops: stops)
    }
}

extension PreparedRoute: Identifiable {
    public var id: String { route.id }
}
