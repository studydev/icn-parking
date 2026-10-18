import Foundation
import ICNParkingCore
import Observation

/// 앱 전체 상태(README State). 화면은 이 값만 읽고 바꾼다.
@MainActor
@Observable
final class AppModel {
    enum Phase: Equatable {
        /// 빌드에 데이터 주소가 없음(Config/Local.xcconfig)
        case notConfigured
        case loading
        case loaded
        /// 네트워크도 저장본도 없음
        case failed
    }

    private(set) var phase: Phase
    private(set) var latest: Loaded<LatestDoc>?
    private(set) var calendar: CalendarDoc?
    private(set) var days: [String: DayDoc] = [:]
    private(set) var refreshing = false
    private(set) var loadingHistory = false
    /// 상단 줄 "N분 전"·예측 기준 시각. 새로고침·주기 갱신 때 바뀐다
    private(set) var now = Date()
    let shuttle: ShuttleSchedule?

    var terminal: Terminal
    var sheet: SheetTarget?
    var historyDays = 7
    var historyGroup: ZoneGroup = .short { didSet { historyFocus = HistoryModel.allId } }
    var historyFocus = HistoryModel.allId
    var settings: AppSettings { didSet { settingsStore.save(settings) } }

    private let client: DataClient?
    private let settingsStore: SettingsStore

    init(client: DataClient?, shuttle: ShuttleSchedule? = AppModel.bundledShuttle(), settingsStore: SettingsStore = SettingsStore()) {
        self.client = client
        self.shuttle = shuttle
        self.settingsStore = settingsStore
        let settings = settingsStore.load()
        self.settings = settings
        terminal = settings.defaultTerminal
        phase = client == nil ? .notConfigured : .loading
    }

    /// 실제 앱: Info.plist 데이터 주소 + Application Support 캐시
    static func live() -> AppModel {
        guard let base = AppConfig.dataBaseURL(), let store = try? FileStore.applicationSupport() else { return AppModel(client: nil) }
        return AppModel(client: DataClient(baseURL: base, store: store))
    }

    static func bundledShuttle(_ bundle: Bundle = .main) -> ShuttleSchedule? {
        guard let url = bundle.url(forResource: "shuttle", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let doc = try? JSONDecoder().decode(ShuttleDoc.self, from: data) else { return nil }
        return try? ShuttleSchedule(doc)
    }

    var unit: DisplayUnit {
        get { settings.unit }
        set { settings.unit = newValue }
    }

    var kstNow: ParkingTime.KST { ParkingTime.kst(now) }

    var freshness: Freshness? {
        latest.map { Freshness.of(slot: $0.value.slot, stale: $0.value.stale ?? false, now: now, offline: $0.origin == .offline) }
    }

    var snapshot: ParkingSnapshot? {
        latest.map { ParkingSnapshot(latest: $0.value, days: days, holidays: calendar?.holidays ?? [:], now: kstNow.slotTime) }
    }

    func refresh(force: Bool = false) async {
        guard let client, !refreshing else { return }
        refreshing = true
        defer { refreshing = false }
        do {
            latest = try await client.latest(force: force)
            phase = .loaded
        } catch {
            if latest == nil { phase = .failed }
        }
        now = Date()
        if let cal = try? await client.calendar(force: force) { calendar = cal.value }
        let loaded = await client.days(ParkingSnapshot.forecastDates(today: kstNow.date))
        days.merge(loaded) { _, new in new }
    }

    /// 히스토리 기간의 날짜 파일(지난 날짜는 확정 후 디스크 캐시라 처음 한 번만 받는다)
    func loadHistory() async {
        guard let client else { return }
        loadingHistory = true
        defer { loadingHistory = false }
        let loaded = await client.days(HistoryModel.requiredDates(today: kstNow.date, nDays: historyDays))
        days.merge(loaded) { _, new in new }
    }

    /// 1분마다 시각을 갱신하고 다시 확인한다(60초 캐시라 실제 요청은 최대 분당 1회)
    func tick() async {
        now = Date()
        await refresh()
    }

    /// 셔틀 탭은 15초마다 시각만 바꾼다
    func touchClock() { now = Date() }

    /// 딥링크를 상태에 반영하고 보여 줄 탭을 돌려준다
    func open(_ link: DeepLink) -> AppTab {
        if let t = link.terminal { terminal = t }
        switch link {
        case .zone, .group, .total:
            sheet = link.sheetTarget
            return .live
        case .forecast:
            sheet = nil
            return .forecast
        case .shuttle(let route, let stop):
            sheet = nil
            selectShuttle(route: route, stop: stop)
            return .shuttle
        }
    }

    /// 딥링크 icnparking://shuttle/{route}/{stop}: 지금 터미널 노선 순서에 있으면 그 노선, 승강장이 노선에 있으면 그 승강장
    func selectShuttle(route: String, stop: String?) {
        guard let r = shuttle?.route(route) else { return }
        if !Zones.layout(terminal).shuttleRoutes.contains(route),
           let t = Terminal.allCases.first(where: { Zones.layout($0).shuttleRoutes.contains(route) }) { terminal = t }
        settings.setShuttleRoute(terminal, route)
        if let stop, r.stops.contains(where: { $0.stop.id == stop }) { settings.setShuttleStop(route, stop) }
    }
}

extension Freshness {
    /// 상단 줄 문구(README 상단 줄)
    var text: String {
        switch self {
        case .normal(let time, let minutes):
            return Strings.Meta.updated(time: time, ago: minutes == 0 ? Strings.Meta.justNow : Strings.Meta.minutesAgo(minutes: "\(minutes)"))
        case .delayed(let time, let minutes):
            return Strings.Meta.delayed(minutes: "\(minutes)", time: time)
        case .offline(let time):
            return Strings.Meta.offline(time: time)
        }
    }

    var isWarning: Bool {
        if case .normal = self { return false }
        return true
    }
}
