import Foundation

/// 기기에 저장하는 설정(README State 저장: unit, defaultTerm, shRoute, shStop + 예측 ▲▼ 표시). 즐겨찾기 없음.
/// 키 이름은 Android SettingsStore와 같다.
public struct AppSettings: Equatable, Sendable {
    public var unit: DisplayUnit = .available
    public var defaultTerminal: Terminal = .t1
    /// 예측 칸 아래 ▲▼ 변화량(디자인 Tweak showDelta, 기본 꺼짐)
    public var showDelta = false
    var shuttleRoutes: [Terminal: String] = [:]
    var shuttleStops: [String: String] = [:]

    public init() {}

    /// 터미널별 마지막 선택 노선. 없거나 그 터미널 노선이 아니면 노선 순서의 첫 노선
    public func shuttleRoute(_ terminal: Terminal) -> String {
        let order = Zones.layout(terminal).shuttleRoutes
        return shuttleRoutes[terminal].flatMap { order.contains($0) ? $0 : nil } ?? order[0]
    }

    public mutating func setShuttleRoute(_ terminal: Terminal, _ route: String) { shuttleRoutes[terminal] = route }

    /// 노선별 마지막 선택 승강장. 없으면 nil(shuttle.json의 노선 default)
    public func shuttleStop(_ route: String) -> String? { shuttleStops[route] }

    public mutating func setShuttleStop(_ route: String, _ stop: String) { shuttleStops[route] = stop }
}

public struct SettingsStore: @unchecked Sendable {
    private let defaults: UserDefaults
    private static let prefix = "icn."

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public func load() -> AppSettings {
        var s = AppSettings()
        s.unit = DisplayUnit(rawValue: defaults.string(forKey: Self.prefix + "unit") ?? "") ?? .available
        s.defaultTerminal = Terminal(rawValue: defaults.string(forKey: Self.prefix + "default_terminal") ?? "") ?? .t1
        s.showDelta = defaults.bool(forKey: Self.prefix + "show_delta")
        for t in Terminal.allCases {
            if let r = defaults.string(forKey: Self.prefix + "shuttle_route_\(t.rawValue)") { s.shuttleRoutes[t] = r }
        }
        for (key, value) in defaults.dictionaryRepresentation() where key.hasPrefix(Self.prefix + "shuttle_stop_") {
            if let v = value as? String { s.shuttleStops[String(key.dropFirst((Self.prefix + "shuttle_stop_").count))] = v }
        }
        return s
    }

    public func save(_ s: AppSettings) {
        defaults.set(s.unit.rawValue, forKey: Self.prefix + "unit")
        defaults.set(s.defaultTerminal.rawValue, forKey: Self.prefix + "default_terminal")
        defaults.set(s.showDelta, forKey: Self.prefix + "show_delta")
        for (t, r) in s.shuttleRoutes { defaults.set(r, forKey: Self.prefix + "shuttle_route_\(t.rawValue)") }
        for (route, stop) in s.shuttleStops { defaults.set(stop, forKey: Self.prefix + "shuttle_stop_\(route)") }
    }
}
