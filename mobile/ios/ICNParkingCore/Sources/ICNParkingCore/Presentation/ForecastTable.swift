/// 예측 표가 칸을 비우는 이유(디자인 5h 회색 칸)
public enum ForecastRowReason: Hashable, Sendable {
    case closed, missing, capacityChanged, unavailable

    public var text: String {
        switch self {
        case .closed: return Strings.Forecast.reasonClosed
        case .missing: return Strings.Forecast.reasonMissing
        case .capacityChanged: return Strings.Forecast.reasonCapacityChanged
        case .unavailable: return Strings.Forecast.reasonUnavailable
        }
    }

    /// 지금 값과 예측 결과로 사유를 정한다(예측이 되면 nil)
    public static func of(_ now: ZoneNow, _ result: ForecastResult?) -> ForecastRowReason? {
        if now.closed { return .closed }
        if now.missing { return .missing }
        guard case .unavailable(let failure, _) = result else { return result == nil ? .unavailable : nil }
        switch failure {
        case .recentClosed, .latestClosed: return .closed
        case .noCurrent, .capacityUnknown: return .missing
        case .capacityChanged: return .capacityChanged
        case .noHistory: return .unavailable
        }
    }
}

/// 지금 값 또는 예측 칸 하나(남은 대수·점유율)
public struct ValuePair: Hashable, Sendable {
    public let available: Double
    public let occupancy: Double

    public init(available: Double, occupancy: Double) {
        self.available = available
        self.occupancy = occupancy
    }

    public func text(_ unit: DisplayUnit) -> String {
        unit == .occupancy ? NumberText.percent(occupancy) + Strings.Unit.percent : NumberText.plain(available)
    }

    /// 지금보다 얼마나 변했는지(점유율 모드는 %p)
    public func delta(from now: ValuePair, _ unit: DisplayUnit) -> Int {
        unit == .occupancy
            ? NumberText.round(occupancy * 100) - NumberText.round(now.occupancy * 100)
            : NumberText.round(available) - NumberText.round(now.available)
    }
}

public struct ForecastRow: Hashable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let target: SheetTarget
    public let isTotal: Bool
    /// 지금 값. 운영 중단·현재값 없음이면 nil("—")
    public let now: ValuePair?
    /// 6칸. reason이 있으면 빈 배열
    public let cells: [ValuePair]
    public let reason: ForecastRowReason?
}

public enum ForecastTableItem: Hashable, Sendable, Identifiable {
    case label(String)
    case row(ForecastRow)

    public var id: String {
        switch self {
        case .label(let text): return "label:" + text
        case .row(let row): return row.id
        }
    }
}

/// 예측 탭 표(디자인 5d/5f): 전체 → 단기 층 → 장기·타워 → 예약
public struct ForecastTable: Sendable {
    /// 6칸 시각(지금 + 30분씩)
    public let times: [SlotTime]
    public let items: [ForecastTableItem]

    public init(_ snapshot: ParkingSnapshot, terminal: Terminal) {
        let results = snapshot.forecasts(terminal)
        let layout = Zones.layout(terminal)
        times = CellSchedule.halfHourly.slots(after: snapshot.now.slot).map { ParkingTime.slotRange(snapshot.now.date, $0) }

        let total = snapshot.group(.total(terminal), results: results)
        let totalNow = total.available.flatMap { a in total.occupancy.map { ValuePair(available: Double(a), occupancy: $0) } }
        let totalRow = ForecastRow(
            id: "total", name: Strings.Forecast.total, target: .total(terminal), isTotal: true, now: totalNow,
            cells: total.cells.map { ValuePair(available: $0.available, occupancy: $0.occupancy) },
            reason: total.included.isEmpty ? .missing : total.hasForecast ? nil : .unavailable)

        func zoneRow(_ id: String) -> ForecastTableItem {
            let now = snapshot.zoneNow(id), result = results[id]
            let reason = ForecastRowReason.of(now, result)
            let nowPair = now.available.flatMap { a in now.occupancy.map { ValuePair(available: Double(a), occupancy: $0) } }
            // 비교일 기록이 빈 칸은 지금 값으로(그룹 합계와 같은 규칙). reason이 없으면 nowPair도 있다
            let cells: [ValuePair] = reason != nil ? [] : (result?.forecast?.cells ?? []).compactMap { cell in
                guard let a = cell.available, let o = cell.occupancy else { return nowPair }
                return ValuePair(available: a, occupancy: o)
            }
            return .row(ForecastRow(id: id, name: Zones.byId[id]?.shortName ?? id, target: .zone(id), isTotal: false, now: nowPair, cells: cells, reason: reason))
        }

        items = [.row(totalRow), .label(Strings.Forecast.sectionShort)] + layout.floors.map(zoneRow)
            + [.label(Strings.Forecast.sectionLong)] + layout.long.map(zoneRow) + [zoneRow(layout.reserved)]
    }
}
