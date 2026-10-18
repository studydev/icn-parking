/// 위젯(디자인 5m) 내용. 소 = 구역·그룹 하나, 중 = 터미널 단기·장기 × 지금·1·2·3시간 뒤. Android WidgetModel과 같은 계산
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

public struct MediumWidgetModel: Hashable, Sendable {
    public struct Cell: Hashable, Sendable {
        public let time: String
        public let available: Int
        public let delta: Int
        public let occupancy: Double

        public init(time: String, available: Int, delta: Int, occupancy: Double) {
            self.time = time
            self.available = available
            self.delta = delta
            self.occupancy = occupancy
        }
    }

    public struct Row: Hashable, Sendable {
        public let name: String
        public let available: Int?
        /// 1·2·3시간 뒤. 예측이 없으면 빈 배열
        public let cells: [Cell]

        public init(name: String, available: Int?, cells: [Cell]) {
            self.name = name
            self.available = available
            self.cells = cells
        }
    }

    public let title: String
    public let ago: String
    public let rows: [Row]
    public let link: DeepLink

    public init(title: String, ago: String, rows: [Row], link: DeepLink) {
        self.title = title
        self.ago = ago
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

    public static func small(_ s: ParkingSnapshot, target: SheetTarget, agoMinutes: Int) -> SmallWidgetModel {
        let engine = s.engine
        let results = Dictionary(uniqueKeysWithValues: s.zoneIds(target).map { ($0, engine.zone($0)) })
        let available: Int?, occupancy: Double?, word: String?, hour: Double?
        switch target {
        case .zone(let id):
            let now = s.zoneNow(id)
            available = now.available
            occupancy = now.occupancy
            word = now.word
            hour = results[id]?.forecast?.cells[1].available
        case .group, .total:
            let g = s.group(target, results: results)
            available = g.available
            occupancy = g.occupancy
            word = g.included.isEmpty ? Strings.Zone.missing : nil
            hour = g.hasForecast ? g.cells[1].available : nil
        }
        return SmallWidgetModel(
            title: target.title, available: available, word: word, occupancy: occupancy,
            deltaHour: hour.flatMap { h in available.map { NumberText.round(h) - $0 } },
            ago: ago(minutes: agoMinutes), link: target.deepLink)
    }

    public static func medium(_ s: ParkingSnapshot, terminal: Terminal, agoMinutes: Int) -> MediumWidgetModel {
        let results = s.forecasts(terminal)
        let rows = [ZoneGroup.short, .long].map { group -> MediumWidgetModel.Row in
            let g = s.group(.group(terminal, group), results: results)
            let cells: [MediumWidgetModel.Cell] = g.hasForecast && g.available != nil ? hourCells.map { k in
                let c = g.cells[k], a = NumberText.round(c.available)
                return MediumWidgetModel.Cell(time: ParkingTime.slotRange(s.now.date, s.now.slot + 6 * (k + 1)).label, available: a, delta: a - g.available!, occupancy: c.occupancy)
            } : []
            return MediumWidgetModel.Row(name: group.label, available: g.available, cells: cells)
        }
        return MediumWidgetModel(title: Strings.Widget.mediumTitle(terminal: terminal.rawValue), ago: ago(minutes: agoMinutes), rows: rows, link: .forecast(terminal))
    }
}
