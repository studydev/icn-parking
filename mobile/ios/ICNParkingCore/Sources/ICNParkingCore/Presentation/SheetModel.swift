/// 그래프 점(x = 지금 슬롯 기준 5분 칸 차이, y = 남은 대수)
public struct SeriesPoint: Hashable, Sendable {
    public let offset: Int
    public let available: Double
}

/// 그래프 아래 시각 눈금
public struct AxisLabel: Hashable, Sendable {
    public let offset: Int
    public let label: String
    public let isNow: Bool
}

/// 시간대별 표의 열(선택한 곳이 맨 앞)
public struct TimelineColumn: Hashable, Sendable {
    public let target: SheetTarget
    public let name: String
    public let selected: Bool
}

/// 시간대별 표의 행: 지금 + 30분씩 12칸. 값이 없으면 nil(운영 중단·현재값 없음·예측 불가)
public struct TimelineRow: Hashable, Sendable {
    public let time: SlotTime
    public let isNow: Bool
    public let values: [ValuePair?]
}

/// 셔틀 정차 순서처럼 세로로 읽는 시간대별 예상(선택 주차장 + 같은 단기/장기 묶음의 다른 주차장)
public struct SheetTimeline: Sendable {
    public let columns: [TimelineColumn]
    public let rows: [TimelineRow]
}

/// 상세 시트: 구역·그룹·터미널 전체. 그래프는 지난 2시간 실측 + 6시간 예상(30분 점마다 숫자)
public struct SheetModel: Sendable {
    /// 지난 2시간 · 앞으로 6시간(5분 칸 단위 차이)
    public static let pastOffsets = Array(stride(from: -24, through: 0, by: 6))
    public static let allOffsets = Array(stride(from: -24, through: 72, by: 6))

    public let kicker: String
    public let name: String
    public let available: Int?
    public let capacity: Int
    public let occupancy: Double?
    /// 지난 2시간 실측(30분 점, 보정값 포함 — README: 그래프에는 그린다)
    public let actual: [SeriesPoint]
    /// 지금 + 6시간 예상(30분 점). 예측이 없으면 빈 배열
    public let forecast: [SeriesPoint]
    /// 비교 주 같은 시각(30분 점, −2시간 … +6시간)
    public let base: [SeriesPoint]
    public let axis: [AxisLabel]
    public let explain: String
    public let timeline: SheetTimeline
    /// 시트 맨 아래. 상단 줄 문구를 받아 붙인다
    public let footer: @Sendable (_ updated: String) -> String

    public var nowPair: ValuePair? { available.flatMap { a in occupancy.map { ValuePair(available: Double(a), occupancy: $0) } } }

    public init(_ s: ParkingSnapshot, target: SheetTarget) {
        let builder = Builder(s, target)
        switch target {
        case .zone(let id): self = builder.zone(id)
        case .group(_, let g): self = builder.group(name: Strings.Sheet.groupName(group: g.label))
        case .total(let t): self = builder.group(name: Strings.Forecast.totalA11y(terminal: t.rawValue))
        }
    }

    init(kicker: String, name: String, available: Int?, capacity: Int, occupancy: Double?, actual: [SeriesPoint], forecast: [SeriesPoint],
         base: [SeriesPoint], axis: [AxisLabel], explain: String, timeline: SheetTimeline, footer: @escaping @Sendable (String) -> String) {
        self.kicker = kicker
        self.name = name
        self.available = available
        self.capacity = capacity
        self.occupancy = occupancy
        self.actual = actual
        self.forecast = forecast
        self.base = base
        self.axis = axis
        self.explain = explain
        self.timeline = timeline
        self.footer = footer
    }

    private struct Builder {
        let s: ParkingSnapshot
        let target: SheetTarget
        let terminal: Terminal
        let engine: ForecastEngine
        /// 터미널 모든 구역의 30분 칸 예측(시간대별 표의 다른 주차장 열에도 쓴다)
        let results: [String: ForecastResult]
        let axis: [AxisLabel]

        init(_ s: ParkingSnapshot, _ target: SheetTarget) {
            self.s = s
            self.target = target
            switch target {
            case .zone(let id): terminal = Zones.byId[id]?.terminal ?? .t1
            case .group(let t, _), .total(let t): terminal = t
            }
            engine = s.engine
            results = s.forecasts(terminal)
            axis = stride(from: -24, through: 72, by: 12).map {
                AxisLabel(offset: $0, label: $0 == 0 ? Strings.Sheet.nowMarker(time: s.now.label) : ParkingTime.slotRange(s.now.date, s.now.slot + $0).label, isNow: $0 == 0)
            }
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
            let kicker = zone?.category == .tower ? Strings.Sheet.kickerTower(terminal: terminal.rawValue)
                : Strings.Sheet.kickerZone(terminal: terminal.rawValue, category: zone?.category.rawValue ?? "")
            let actual = SheetModel.pastOffsets.compactMap { o in dayAvailable(id, o).map { SeriesPoint(offset: o, available: $0) } }
            let capacity = zn.capacity ?? result?.forecast?.current.capacity ?? 0
            let timeline = timeline()
            guard let f = result?.forecast, let now = zn.available else {
                return SheetModel(kicker: kicker, name: zone?.name ?? id, available: zn.available, capacity: capacity, occupancy: zn.occupancy,
                                  actual: actual, forecast: [], base: [], axis: axis, explain: SheetModel.why(result, zn), timeline: timeline,
                                  footer: { Strings.Sheet.footerGroup(updated: $0) })
            }
            let weeksAgo = f.weeksBack == 1 ? Strings.Sheet.lastWeek : Strings.Sheet.weeksAgo(weeks: "\(f.weeksBack)")
            // 지금 차이 = 남은 대수 기준(지금 − 그때). 그래프와 같은 단위
            let diff = NumberText.round(f.baseParking - Double(f.current.parking))
            let explain = Strings.Sheet.explain(weeksAgo: weeksAgo, weekday: Strings.Weekday.long[LocalDate.weekday(f.compareDate)],
                                                date: NumberText.monthDay(f.compareDate), diff: (diff >= 0 ? "+" : "−") + NumberText.grouped(abs(diff)))
            let compare = f.compareDate, weekday = Strings.Weekday.short[LocalDate.weekday(f.compareDate)]
            return SheetModel(
                kicker: kicker, name: zone?.name ?? id, available: now, capacity: capacity, occupancy: zn.occupancy, actual: actual,
                forecast: [SeriesPoint(offset: 0, available: Double(now))] + f.cells.enumerated().compactMap { k, c in c.available.map { SeriesPoint(offset: 6 * (k + 1), available: $0) } },
                base: SheetModel.allOffsets.compactMap { o in baseAvailable(id, o).map { SeriesPoint(offset: o, available: $0) } },
                axis: axis, explain: explain, timeline: timeline,
                footer: { Strings.Sheet.footer(updated: $0, date: compare, weekday: weekday) })
        }

        func group(name: String) -> SheetModel {
            let g = s.group(target, results: results)
            let actual = SheetModel.pastOffsets.compactMap { o -> SeriesPoint? in
                let values = g.included.compactMap { dayAvailable($0, o) }
                return values.isEmpty || values.count < g.included.count ? nil : SeriesPoint(offset: o, available: values.reduce(0, +))
            }
            let footer: @Sendable (String) -> String = { Strings.Sheet.footerGroup(updated: $0) + Strings.Sheet.footerGroupSuffix }
            let kicker = Strings.Sheet.kickerGroup(terminal: terminal.rawValue)
            guard g.hasForecast, let now = g.available else {
                return SheetModel(kicker: kicker, name: name, available: g.available, capacity: g.capacity, occupancy: g.occupancy, actual: actual,
                                  forecast: [], base: [], axis: axis, explain: Strings.Forecast.whyNoHistory, timeline: timeline(), footer: footer)
            }
            // 비교 주 선: 예측 있는 구역은 각자 비교 주, 없는 구역은 지금 값(그룹 예측과 같은 규칙)
            let base = SheetModel.allOffsets.compactMap { o -> SeriesPoint? in
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
            return SheetModel(
                kicker: kicker, name: name, available: now, capacity: g.capacity, occupancy: g.occupancy, actual: actual,
                forecast: [SeriesPoint(offset: 0, available: Double(now))] + g.cells.enumerated().map { SeriesPoint(offset: 6 * ($0.offset + 1), available: $0.element.available) },
                base: base, axis: axis, explain: Strings.Sheet.explainGroup, timeline: timeline(), footer: footer)
        }

        /// 열: 구역 → 그 구역 + 같은 묶음 다른 구역, 그룹 → 그룹 전체 + 소속 구역, 터미널 전체 → 전체 + 단기 + 장기
        func timeline() -> SheetTimeline {
            let layout = Zones.layout(terminal)
            let columns: [TimelineColumn]
            switch target {
            case .zone(let id):
                let ids = layout.ids(Zones.byId[id]?.category.group ?? .short)
                columns = ([id] + ids.filter { $0 != id }).map { TimelineColumn(target: .zone($0), name: Zones.byId[$0]?.shortName ?? $0, selected: $0 == id) }
            case .group(_, let g):
                columns = [TimelineColumn(target: target, name: Strings.Widget.total, selected: true)]
                    + layout.ids(g).map { TimelineColumn(target: .zone($0), name: Zones.byId[$0]?.shortName ?? $0, selected: false) }
            case .total(let t):
                columns = [TimelineColumn(target: target, name: Strings.Widget.total, selected: true),
                           TimelineColumn(target: .group(t, .short), name: Strings.History.groupShort, selected: false),
                           TimelineColumn(target: .group(t, .long), name: Strings.History.groupLong, selected: false)]
            }
            // 열마다 지금 값 + 12칸 예상
            let series: [[ValuePair?]] = columns.map { column in
                switch column.target {
                case .zone(let id):
                    let zn = s.zoneNow(id)
                    let now = zn.available.flatMap { a in zn.occupancy.map { ValuePair(available: Double(a), occupancy: $0) } }
                    let cells: [ValuePair?] = results[id]?.forecast.map { f in f.cells.map { c in c.available.flatMap { a in c.occupancy.map { ValuePair(available: a, occupancy: $0) } } } } ?? []
                    return [now] + (now == nil ? [] : cells)
                case .group, .total:
                    let g = s.group(column.target, results: results)
                    let now = g.available.flatMap { a in g.occupancy.map { ValuePair(available: Double(a), occupancy: $0) } }
                    return [now] + (g.hasForecast ? g.cells.map { ValuePair(available: $0.available, occupancy: $0.occupancy) } : [])
                }
            }
            let times = [s.now] + CellSchedule.halfHourly.slots(after: s.now.slot).map { ParkingTime.slotRange(s.now.date, $0) }
            let rows = times.enumerated().map { k, time in
                TimelineRow(time: time, isNow: k == 0, values: series.map { k < $0.count ? $0[k] : nil })
            }
            return SheetTimeline(columns: columns, rows: rows)
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

extension TerminalLayout {
    /// 묶음의 구역 id(화면 순서): 단기 = 위층부터, 장기·타워 = 예측 표 순서, 예약 = 하나
    public func ids(_ group: ZoneGroup) -> [String] {
        switch group {
        case .short: return floors
        case .long: return long
        case .reserved: return [reserved]
        }
    }
}
