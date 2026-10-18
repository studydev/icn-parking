/// 위젯 소: 주차장 한 곳 숫자 + 1시간 뒤(디자인 5m). Android SmallWidgetModel과 같은 계산
public struct SmallWidgetModel: Hashable, Sendable {
    public let title: String
    public let available: Int?
    /// 숫자 대신 말(운영 중단·확인 필요·만차)
    public let word: String?
    public let occupancy: Double?
    /// 1시간 뒤 − 지금(남은 대수). 예측이 없으면 nil
    public let deltaHour: Int?
    /// "2분 전 기준"
    public let ago: String
    public let link: DeepLink

    public init(title: String, available: Int?, word: String?, occupancy: Double?, deltaHour: Int?, ago: String, link: DeepLink) {
        self.title = title
        self.available = available
        self.word = word
        self.occupancy = occupancy
        self.deltaHour = deltaHour
        self.ago = ago
        self.link = link
    }
}

/// 위젯 중: 주차장 한 곳의 3시간 그래프(지금 + 30분 점 6개, 점마다 남은 대수)
public struct GraphWidgetModel: Hashable, Sendable {
    public struct Point: Hashable, Sendable {
        /// "지금" 또는 "10:30"
        public let label: String
        public let available: Int?
        public let occupancy: Double?

        public init(label: String, available: Int?, occupancy: Double?) {
            self.label = label
            self.available = available
            self.occupancy = occupancy
        }
    }

    public let title: String
    public let ago: String
    /// 7개(지금 + 30분 … 3시간). 예측이 없으면 지금 하나
    public let points: [Point]
    public let link: DeepLink

    public init(title: String, ago: String, points: [Point], link: DeepLink) {
        self.title = title
        self.ago = ago
        self.points = points
        self.link = link
    }
}

/// 위젯 대: 터미널 묶음(단기·장기·예약)의 주차장별 지금 + 1·2·3시간 뒤
public struct TableWidgetModel: Hashable, Sendable {
    public struct Cell: Hashable, Sendable {
        public let available: Int
        public let delta: Int
        public let occupancy: Double

        public init(available: Int, delta: Int, occupancy: Double) {
            self.available = available
            self.delta = delta
            self.occupancy = occupancy
        }
    }

    public struct Row: Hashable, Sendable {
        public let name: String
        public let isTotal: Bool
        public let available: Int?
        /// 숫자 대신 말(운영 중단·확인 필요)
        public let word: String?
        /// 1·2·3시간 뒤. 예측이 없으면 빈 배열
        public let cells: [Cell]

        public init(name: String, isTotal: Bool, available: Int?, word: String?, cells: [Cell]) {
            self.name = name
            self.isTotal = isTotal
            self.available = available
            self.word = word
            self.cells = cells
        }
    }

    public let title: String
    public let ago: String
    /// 1·2·3시간 뒤 시각
    public let times: [String]
    public let rows: [Row]
    public let link: DeepLink

    public init(title: String, ago: String, times: [String], rows: [Row], link: DeepLink) {
        self.title = title
        self.ago = ago
        self.times = times
        self.rows = rows
        self.link = link
    }
}

public enum WidgetModels {
    /// 지금 칸 기준 1·2·3시간 뒤 = 30분 칸 1·3·5번
    static let hourCells = [1, 3, 5]

    public static func ago(minutes: Int) -> String {
        Strings.Widget.updatedAgo(ago: minutes == 0 ? Strings.Meta.justNow : Strings.Meta.minutesAgo(minutes: "\(minutes)"))
    }

    /// 대상의 지금 값과 30분 칸 예상(남은 대수·점유율)
    static func series(_ s: ParkingSnapshot, _ target: SheetTarget, _ results: [String: ForecastResult]) -> (now: ValuePair?, word: String?, cells: [ValuePair?]) {
        switch target {
        case .zone(let id):
            let zn = s.zoneNow(id)
            let now = zn.available.flatMap { a in zn.occupancy.map { ValuePair(available: Double(a), occupancy: $0) } }
            let cells = results[id]?.forecast?.cells.map { c in c.available.flatMap { a in c.occupancy.map { ValuePair(available: a, occupancy: $0) } } } ?? []
            return (now, zn.word, now == nil ? [] : cells)
        case .group, .total:
            let g = s.group(target, results: results)
            let now = g.available.flatMap { a in g.occupancy.map { ValuePair(available: Double(a), occupancy: $0) } }
            return (now, g.included.isEmpty ? Strings.Zone.missing : nil, g.hasForecast ? g.cells.map { ValuePair(available: $0.available, occupancy: $0.occupancy) } : [])
        }
    }

    static func terminal(of target: SheetTarget) -> Terminal {
        switch target {
        case .zone(let id): return Zones.byId[id]?.terminal ?? .t1
        case .group(let t, _), .total(let t): return t
        }
    }

    public static func small(_ s: ParkingSnapshot, target: SheetTarget, agoMinutes: Int) -> SmallWidgetModel {
        let (now, word, cells) = series(s, target, s.forecasts(terminal(of: target)))
        let available = now.map { NumberText.round($0.available) }
        let hour = cells.count > 1 ? cells[1] : nil
        return SmallWidgetModel(
            title: target.title, available: available, word: word, occupancy: now?.occupancy,
            deltaHour: hour.flatMap { h in available.map { NumberText.round(h.available) - $0 } },
            ago: ago(minutes: agoMinutes), link: target.deepLink)
    }

    public static func graph(_ s: ParkingSnapshot, target: SheetTarget, agoMinutes: Int) -> GraphWidgetModel {
        let (now, _, cells) = series(s, target, s.forecasts(terminal(of: target)))
        var points = [GraphWidgetModel.Point(label: Strings.Forecast.now, available: now.map { NumberText.round($0.available) }, occupancy: now?.occupancy)]
        for k in 0..<min(6, cells.count) {
            points.append(.init(label: ParkingTime.slotRange(s.now.date, s.now.slot + 6 * (k + 1)).label,
                                available: cells[k].map { NumberText.round($0.available) }, occupancy: cells[k]?.occupancy))
        }
        return GraphWidgetModel(title: target.title, ago: ago(minutes: agoMinutes), points: points, link: target.deepLink)
    }

    public static func table(_ s: ParkingSnapshot, terminal: Terminal, group: ZoneGroup, agoMinutes: Int) -> TableWidgetModel {
        let results = s.forecasts(terminal)
        let ids = Zones.layout(terminal).ids(group)
        let targets: [SheetTarget] = (ids.count > 1 ? [SheetTarget.group(terminal, group)] : []) + ids.map { .zone($0) }
        let rows = targets.map { target -> TableWidgetModel.Row in
            let (now, word, cells) = series(s, target, results)
            let available = now.map { NumberText.round($0.available) }
            let hourly: [TableWidgetModel.Cell] = available == nil || cells.count < 6 ? [] : hourCells.compactMap { k in
                cells[k].map { c in TableWidgetModel.Cell(available: NumberText.round(c.available), delta: NumberText.round(c.available) - available!, occupancy: c.occupancy) }
            }
            if case .zone(let id) = target {
                return .init(name: Zones.byId[id]?.shortName ?? id, isTotal: false, available: available, word: word, cells: hourly.count == 3 ? hourly : [])
            }
            return .init(name: Strings.Widget.total, isTotal: true, available: available, word: word, cells: hourly.count == 3 ? hourly : [])
        }
        return TableWidgetModel(
            title: SheetTarget.group(terminal, group).title, ago: ago(minutes: agoMinutes),
            times: hourCells.map { ParkingTime.slotRange(s.now.date, s.now.slot + 6 * ($0 + 1)).label },
            rows: rows, link: .forecast(terminal))
    }
}
