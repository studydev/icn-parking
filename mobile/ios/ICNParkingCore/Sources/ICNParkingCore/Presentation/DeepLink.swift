import Foundation

/// icnparking:// 딥링크. 가이드: icnparking://zone/{id}, icnparking://shuttle/{route}/{stop}
/// 위젯용으로 group/{T1}/{short|long|reserved}, total/{T1}, forecast/{T1}도 받는다. Android DeepLink와 같은 규칙
public enum DeepLink: Hashable, Sendable {
    case zone(String)
    case group(Terminal, ZoneGroup)
    case total(Terminal)
    case forecast(Terminal)
    case shuttle(route: String, stop: String?)

    public static let scheme = "icnparking"

    public init?(url: URL) {
        guard url.scheme?.lowercased() == Self.scheme, let host = url.host() else { return nil }
        let parts = [host] + url.pathComponents.filter { $0 != "/" }
        switch (parts[0], parts.count) {
        case ("zone", 2) where Zones.byId[parts[1]] != nil:
            self = .zone(parts[1])
        case ("group", 3):
            guard let t = Terminal(rawValue: parts[1]), let g = ZoneGroup(rawValue: parts[2]) else { return nil }
            self = .group(t, g)
        case ("total", 2):
            guard let t = Terminal(rawValue: parts[1]) else { return nil }
            self = .total(t)
        case ("forecast", 2):
            guard let t = Terminal(rawValue: parts[1]) else { return nil }
            self = .forecast(t)
        case ("shuttle", 2), ("shuttle", 3):
            self = .shuttle(route: parts[1], stop: parts.count == 3 ? parts[2] : nil)
        default:
            return nil
        }
    }

    public var url: URL {
        let path: String
        switch self {
        case .zone(let id): path = "zone/\(id)"
        case .group(let t, let g): path = "group/\(t.rawValue)/\(g.rawValue)"
        case .total(let t): path = "total/\(t.rawValue)"
        case .forecast(let t): path = "forecast/\(t.rawValue)"
        case .shuttle(let route, let stop): path = "shuttle/\(route)" + (stop.map { "/\($0)" } ?? "")
        }
        return URL(string: "\(Self.scheme)://\(path)")!
    }

    /// 열 시트(구역·그룹·전체 링크)
    public var sheetTarget: SheetTarget? {
        switch self {
        case .zone(let id): return .zone(id)
        case .group(let t, let g): return .group(t, g)
        case .total(let t): return .total(t)
        case .forecast, .shuttle: return nil
        }
    }

    /// 화면 터미널을 바꿔야 하면 그 터미널
    public var terminal: Terminal? {
        switch self {
        case .zone(let id): return Zones.byId[id]?.terminal
        case .group(let t, _), .total(let t), .forecast(let t): return t
        case .shuttle: return nil
        }
    }
}

extension SheetTarget {
    /// 위젯·설정 목록 제목: "T1 전체", "T1 단기주차장", "T1 단기 지하1층"
    public var title: String {
        switch self {
        case .zone(let id):
            guard let z = Zones.byId[id] else { return id }
            return "\(z.terminal.rawValue) \(z.name)"
        case .group(let t, let g): return "\(t.rawValue) \(g.label)"
        case .total(let t): return Strings.Forecast.totalA11y(terminal: t.rawValue)
        }
    }

    public var deepLink: DeepLink {
        switch self {
        case .zone(let id): return .zone(id)
        case .group(let t, let g): return .group(t, g)
        case .total(let t): return .total(t)
        }
    }

    /// id(zone id · "g:T1:short" · "t:T1")에서 다시 만든다
    public init?(id: String) {
        let p = id.split(separator: ":").map(String.init)
        switch p.count {
        case 1 where Zones.byId[id] != nil: self = .zone(id)
        case 2 where p[0] == "t": guard let t = Terminal(rawValue: p[1]) else { return nil }; self = .total(t)
        case 3 where p[0] == "g": guard let t = Terminal(rawValue: p[1]), let g = ZoneGroup(rawValue: p[2]) else { return nil }; self = .group(t, g)
        default: return nil
        }
    }

    /// 위젯 설정에서 고를 수 있는 곳: 터미널 전체 → 그룹 → 구역(터미널 순)
    public static var widgetChoices: [SheetTarget] {
        Terminal.allCases.flatMap { t in
            [.total(t)] + ZoneGroup.allCases.map { .group(t, $0) } + Zones.zones(t).map { .zone($0.id) }
        }
    }
}

/// 빌드 설정의 데이터 주소 정리: "/"로 끝나는 https URL. 없거나 https가 아니면 nil (앱·위젯 공통, Android normalizeDataBaseUrl과 같은 규칙)
public enum DataConfig {
    public static func dataBaseURL(_ raw: String?) -> URL? {
        guard let raw = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty, !raw.contains("$(") else { return nil }
        guard let url = URL(string: raw.hasSuffix("/") ? raw : raw + "/"), url.scheme == "https", url.host() != nil else { return nil }
        return url
    }

    /// Info.plist ICNDataBaseURL(Config/App.xcconfig)
    public static func dataBaseURL(bundle: Bundle) -> URL? { dataBaseURL(bundle.infoDictionary?["ICNDataBaseURL"] as? String) }
}
