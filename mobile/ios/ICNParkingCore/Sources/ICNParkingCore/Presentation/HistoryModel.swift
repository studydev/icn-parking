/// 히스토리 탭(5p/5q) 집계. mobile/shared/reference/history.mjs 이식(같은 픽스처로 검증)
public struct HistoryModel: Sendable {
    public struct Point: Hashable, Sendable {
        public let date: String
        public let hour: Int
    }

    public struct DayInfo: Hashable, Sendable {
        public let date: String
        /// 주말·공휴일
        public let red: Bool
    }

    public struct Stats: Hashable, Sendable {
        public let averageOccupancy: Double
        public let maxOccupancy: Double
        public let averageAvailable: Double
        public let minAvailable: Double
        public let fullHours: Int
    }

    public struct Daily: Hashable, Sendable {
        public let maxOccupancy: Double
        public let minAvailable: Double
    }

    public struct Line: Sendable, Identifiable {
        /// 구역 id 또는 "all"(그룹 전체)
        public let id: String
        public let values: [ValuePair?]
        public let stats: Stats?
        public let daily: [Daily?]
    }

    public static let allId = "all"

    /// N×24+1개(지금 시가 마지막)
    public let points: [Point]
    /// 일별 표 날짜(오늘까지 nDays일)
    public let dates: [DayInfo]
    public let lines: [Line]

    /// 필요한 날짜 파일: 오늘부터 nDays일 전까지
    public static func requiredDates(today: String, nDays: Int) -> [String] {
        (0...nDays).map { LocalDate.addDays(today, -$0) }
    }

    public init(days: [String: DayDoc], zoneIds: [String], now: SlotTime, nDays: Int, holidays: [String: String] = [:]) {
        let n = nDays * 24, h = now.slot / 12, today = now.date
        let points: [Point] = (0...n).map { k in
            let g = h - (n - k)
            return Point(date: LocalDate.addDays(today, floorDiv(g, 24)), hour: floorMod(g, 24))
        }

        struct Bucket { var available = 0.0, occupancy = 0.0, capacity = 0.0, closed = false, valid = false }
        func bucket(_ id: String, _ pt: Point) -> Bucket? {
            guard let z = days[pt.date]?.zones[id] else { return nil }
            let est = Set(z.e ?? [])
            var a = 0.0, o = 0.0, c = 0.0, count = 0, closed = false
            for i in pt.hour * 12 ..< pt.hour * 12 + 12 {
                if pt.date == today && i > now.slot { break }
                let p = i < z.p.count ? z.p[i] : nil, ci = i < z.c.count ? z.c[i] : nil
                if ci == 0 { closed = true }
                guard let p, let ci, ci > 0, !est.contains(i) else { continue }
                a += Double(max(ci - p, 0))
                o += Double(min(p, ci)) / Double(ci)
                c += Double(ci)
                count += 1
            }
            if count > 0 { return Bucket(available: a / Double(count), occupancy: o / Double(count), capacity: c / Double(count), valid: true) }
            return closed ? Bucket(closed: true) : nil
        }

        let buckets = zoneIds.map { id in points.map { bucket(id, $0) } }
        var values: [(String, [ValuePair?])] = zip(zoneIds, buckets).map { id, bs in
            (id, bs.map { b in b.flatMap { $0.valid ? ValuePair(available: $0.available, occupancy: $0.occupancy) : nil } })
        }
        if zoneIds.count > 1 {
            let all: [ValuePair?] = points.indices.map { k in
                let open = buckets.map { $0[k] }.filter { $0?.closed != true }
                guard !open.isEmpty, !open.contains(where: { $0 == nil }) else { return nil }
                let a = open.reduce(0) { $0 + $1!.available }, c = open.reduce(0) { $0 + $1!.capacity }
                return ValuePair(available: a, occupancy: 1 - a / c)
            }
            values.insert((Self.allId, all), at: 0)
        }

        let dates = (0..<nDays).map { LocalDate.addDays(today, $0 - nDays + 1) }
        self.dates = dates.map { d in
            let w = LocalDate.weekday(d)
            return DayInfo(date: d, red: w == 0 || w == 6 || holidays[d] != nil)
        }
        self.points = points
        lines = values.map { id, vs in
            let present = vs.compactMap { $0 }
            let stats = present.isEmpty ? nil : Stats(
                averageOccupancy: present.reduce(0) { $0 + $1.occupancy } / Double(present.count),
                maxOccupancy: present.map(\.occupancy).max()!,
                averageAvailable: present.reduce(0) { $0 + $1.available } / Double(present.count),
                minAvailable: present.map(\.available).min()!,
                fullHours: present.filter { $0.occupancy >= Tokens.fullThreshold }.count)
            let daily: [Daily?] = dates.map { d in
                let dv = zip(points, vs).compactMap { pt, v in pt.date == d ? v : nil }
                return dv.isEmpty ? nil : Daily(maxOccupancy: dv.map(\.occupancy).max()!, minAvailable: dv.map(\.available).min()!)
            }
            return Line(id: id, values: vs, stats: stats, daily: daily)
        }
    }
}
