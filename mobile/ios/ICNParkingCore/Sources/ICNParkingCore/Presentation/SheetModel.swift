/// 그래프 점(x = 지금 슬롯 기준 5분 칸 차이, y = 남은 대수)
public struct SeriesPoint: Hashable, Sendable {
    public let offset: Int
    public let available: Double
}

public struct SheetCell: Hashable, Sendable {
    public let time: SlotTime
    public let value: ValuePair
}

/// 상세 시트(디자인 5i): 구역·그룹·터미널 전체
public struct SheetModel: Sendable {
    public let kicker: String
    public let name: String
    public let available: Int?
    public let capacity: Int
    public let occupancy: Double?
    /// 지난 3시간 실측(5분 칸, 보정값 포함 — README: 그래프에는 그린다)
    public let actual: [SeriesPoint]
    /// 지금 + 3시간 예상(30분 칸). 예측이 없으면 빈 배열
    public let forecast: [SeriesPoint]
    /// 비교 주 같은 시각(30분 칸, −3시간 … +3시간)
    public let base: [SeriesPoint]
    public let explain: String
    public let cells: [SheetCell]
    /// 시트 맨 아래. 상단 줄 문구를 받아 붙인다
    public let footer: @Sendable (_ updated: String) -> String
    public let startLabel: String
    public let nowLabel: String
    public let endLabel: String

    public var nowPair: ValuePair? { available.flatMap { a in occupancy.map { ValuePair(available: Double(a), occupancy: $0) } } }

    public init(_ s: ParkingSnapshot, target: SheetTarget) {
        let builder = Builder(s, target)
        switch target {
        case .zone(let id): self = builder.zone(id)
        case .group(let t, let g): self = builder.group(terminal: t, name: Strings.Sheet.groupName(group: g.label))
        case .total(let t): self = builder.group(terminal: t, name: Strings.Forecast.totalA11y(terminal: t.rawValue))
        }
    }

    init(kicker: String, name: String, available: Int?, capacity: Int, occupancy: Double?, actual: [SeriesPoint], forecast: [SeriesPoint],
         base: [SeriesPoint], explain: String, cells: [SheetCell], footer: @escaping @Sendable (String) -> String, labels: (String, String, String)) {
        self.kicker = kicker
        self.name = name
        self.available = available
        self.capacity = capacity
        self.occupancy = occupancy
        self.actual = actual
        self.forecast = forecast
        self.base = base
        self.explain = explain
        self.cells = cells
        self.footer = footer
        (startLabel, nowLabel, endLabel) = labels
    }

    private struct Builder {
        let s: ParkingSnapshot
        let target: SheetTarget
        let engine: ForecastEngine
        let ids: [String]
        let results: [String: ForecastResult]
        let labels: (String, String, String)
        static let baseOffsets = Array(stride(from: -36, through: 36, by: 6))

        init(_ s: ParkingSnapshot, _ target: SheetTarget) {
            self.s = s
            self.target = target
            engine = s.engine
            ids = s.zoneIds(target)
            let engine = self.engine
            results = Dictionary(uniqueKeysWithValues: ids.map { ($0, engine.zone($0)) })
            labels = (ParkingTime.slotRange(s.now.date, s.now.slot - 36).label, s.now.label, ParkingTime.slotRange(s.now.date, s.now.slot + 36).label)
        }

        /// 날짜 파일의 남은 대수(보정값 포함)
        func dayAvailable(_ id: String, _ offset: Int) -> Double? {
            let at = ParkingTime.slotRange(s.now.date, s.now.slot + offset)
            guard let z = s.days[at.date]?.zones[id], let p = engine.value(z.p, at.slot), let c = engine.value(z.c, at.slot), c > 0 else { return nil }
            return Double(max(c - p, 0))
        }

        /// 구역의 비교 주 같은 시각 남은 대수(예측이 없으면 nil)
        func baseAvailable(_ id: String, _ offset: Int) -> Double? {
            guard let f = results[id]?.forecast else { return nil }
            let at = ParkingTime.slotRange(f.compareDate, s.now.slot + offset)
            return engine.smoothed(id, at.date, at.slot).map { max(Double(f.current.capacity) - $0, 0) }
        }

        func zone(_ id: String) -> SheetModel {
            let zone = Zones.byId[id], zn = s.zoneNow(id), result = results[id]
            let terminal = zone?.terminal.rawValue ?? ""
            let kicker = zone?.category == .tower ? Strings.Sheet.kickerTower(terminal: terminal)
                : Strings.Sheet.kickerZone(terminal: terminal, category: zone?.category.rawValue ?? "")
            let actual = (-36...0).compactMap { o in dayAvailable(id, o).map { SeriesPoint(offset: o, available: $0) } }
            let capacity = zn.capacity ?? result?.forecast?.current.capacity ?? 0
            guard let f = result?.forecast, let now = zn.available else {
                return SheetModel(kicker: kicker, name: zone?.name ?? id, available: zn.available, capacity: capacity, occupancy: zn.occupancy,
                                  actual: actual, forecast: [], base: [], explain: SheetModel.why(result, zn), cells: [],
                                  footer: { Strings.Sheet.footerGroup(updated: $0) }, labels: labels)
            }
            let weeksAgo = f.weeksBack == 1 ? Strings.Sheet.lastWeek : Strings.Sheet.weeksAgo(weeks: "\(f.weeksBack)")
            // 지금 차이 = 남은 대수 기준(지금 − 그때). 그래프와 같은 단위
            let diff = NumberText.round(f.baseParking - Double(f.current.parking))
            let explain = Strings.Sheet.explain(weeksAgo: weeksAgo, weekday: Strings.Weekday.long[LocalDate.weekday(f.compareDate)],
                                                date: NumberText.monthDay(f.compareDate), diff: (diff >= 0 ? "+" : "−") + NumberText.grouped(abs(diff)))
            let compare = f.compareDate, weekday = Strings.Weekday.short[LocalDate.weekday(f.compareDate)]
            return SheetModel(
                kicker: kicker, name: zone?.name ?? id, available: now, capacity: capacity, occupancy: zn.occupancy, actual: actual,
                forecast: [SeriesPoint(offset: 0, available: Double(now))] + zip(1...6, f.cells).compactMap { k, c in c.available.map { SeriesPoint(offset: 6 * k, available: $0) } },
                base: Self.baseOffsets.compactMap { o in baseAvailable(id, o).map { SeriesPoint(offset: o, available: $0) } },
                explain: explain,
                cells: f.cells.compactMap { c in c.available.flatMap { a in c.occupancy.map { SheetCell(time: c.time, value: ValuePair(available: a, occupancy: $0)) } } },
                footer: { Strings.Sheet.footer(updated: $0, date: compare, weekday: weekday) }, labels: labels)
        }

        func group(terminal: Terminal, name: String) -> SheetModel {
            let g = s.group(target, results: results)
            let actual = (-36...0).compactMap { o -> SeriesPoint? in
                let values = g.included.compactMap { dayAvailable($0, o) }
                return values.isEmpty || values.count < g.included.count ? nil : SeriesPoint(offset: o, available: values.reduce(0, +))
            }
            let footer: @Sendable (String) -> String = { Strings.Sheet.footerGroup(updated: $0) + Strings.Sheet.footerGroupSuffix }
            guard g.hasForecast, let now = g.available else {
                return SheetModel(kicker: Strings.Sheet.kickerGroup(terminal: terminal.rawValue), name: name, available: g.available, capacity: g.capacity,
                                  occupancy: g.occupancy, actual: actual, forecast: [], base: [], explain: Strings.Forecast.whyNoHistory, cells: [], footer: footer, labels: labels)
            }
            // 비교 주 선: 예측 있는 구역은 각자 비교 주, 없는 구역은 지금 값(그룹 예측과 같은 규칙)
            let base = Self.baseOffsets.compactMap { o -> SeriesPoint? in
                var sum = 0.0
                for id in g.included {
                    if results[id]?.forecast != nil {
                        guard let b = baseAvailable(id, o) else { return nil }
                        sum += b
                    } else if let cur = s.zoneNow(id).available {
                        sum += Double(cur)
                    }
                }
                return SeriesPoint(offset: o, available: sum)
            }
            let times = CellSchedule.halfHourly.slots(after: s.now.slot).map { ParkingTime.slotRange(s.now.date, $0) }
            return SheetModel(
                kicker: Strings.Sheet.kickerGroup(terminal: terminal.rawValue), name: name, available: now, capacity: g.capacity, occupancy: g.occupancy,
                actual: actual,
                forecast: [SeriesPoint(offset: 0, available: Double(now))] + zip(1...6, g.cells).map { SeriesPoint(offset: 6 * $0, available: $1.available) },
                base: base, explain: Strings.Sheet.explainGroup,
                cells: zip(times, g.cells).map { SheetCell(time: $0, value: ValuePair(available: $1.available, occupancy: $1.occupancy)) },
                footer: footer, labels: labels)
        }
    }

    /// 예측이 없을 때 설명(디자인 5g/5i why)
    static func why(_ result: ForecastResult?, _ now: ZoneNow) -> String {
        if now.closed { return Strings.Forecast.whyClosed }
        if now.missing { return Strings.Forecast.whyMissing }
        guard case .unavailable(let failure, _) = result else { return Strings.Forecast.whyNoHistory }
        switch failure {
        case .recentClosed, .latestClosed: return Strings.Forecast.whyClosed
        case .noCurrent: return Strings.Forecast.whyMissing
        case .capacityUnknown: return Strings.Forecast.whyCapacityUnknown
        case .capacityChanged(let from, let to): return Strings.Forecast.whyCapacityChanged(from: NumberText.grouped(from), to: NumberText.grouped(to))
        case .noHistory: return Strings.Forecast.whyNoHistory
        }
    }
}
