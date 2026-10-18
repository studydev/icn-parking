import AppIntents
import ICNParkingCore
import SwiftUI
import WidgetKit

// 위젯 3종. App Group 없이 위젯이 공개 파일을 직접 받는다(확장 자체 캐시, 지난 날짜는 영구 저장).
// 15분마다 다시 그린다. 누르면 icnparking:// 딥링크로 앱의 해당 시트·탭이 열린다.
//   소: 주차장 한 곳 숫자 · 중: 주차장 한 곳 3시간 그래프 · 대: 터미널 묶음의 주차장별 표
// 위젯을 길게 눌러 "위젯 편집"에서 주차장·터미널(T1/T2)·묶음을 고른다.

@main
struct ICNParkingWidgetBundle: WidgetBundle {
    var body: some Widget {
        SmallParkingWidget()
        GraphParkingWidget()
        TableParkingWidget()
    }
}

// MARK: - 설정
// App Intents 메타데이터는 컴파일할 때 문자열 상수를 읽으므로 제목은 strings.ko.json과 같은 문구를 직접 쓴다.

struct ParkingTargetEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "주차장"
    static let defaultQuery = ParkingTargetQuery()

    let id: String
    var target: SheetTarget? { SheetTarget(id: id) }
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(target?.title ?? id)") }
}

struct ParkingTargetQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [ParkingTargetEntity] {
        identifiers.filter { SheetTarget(id: $0) != nil }.map(ParkingTargetEntity.init)
    }

    func suggestedEntities() async throws -> [ParkingTargetEntity] {
        SheetTarget.widgetChoices.map { ParkingTargetEntity(id: $0.id) }
    }

    func defaultResult() async -> ParkingTargetEntity? { ParkingTargetEntity(id: SheetTarget.group(.t1, .short).id) }
}

struct SmallWidgetIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "위젯에 보여 줄 주차장"
    @Parameter(title: "주차장") var target: ParkingTargetEntity?

    init() {}
}

struct GraphWidgetIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "위젯에 보여 줄 주차장"
    @Parameter(title: "주차장") var target: ParkingTargetEntity?

    init() {}
}

enum TerminalOption: String, AppEnum {
    case t1 = "T1", t2 = "T2"
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "터미널"
    static let caseDisplayRepresentations: [TerminalOption: DisplayRepresentation] = [.t1: "T1 제1터미널", .t2: "T2 제2터미널"]
    var terminal: Terminal { self == .t1 ? .t1 : .t2 }
}

enum GroupOption: String, AppEnum {
    case short, long, reserved
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "주차장 묶음"
    static let caseDisplayRepresentations: [GroupOption: DisplayRepresentation] = [.short: "단기주차장", .long: "장기·주차타워", .reserved: "예약주차장"]
    var group: ZoneGroup { ZoneGroup(rawValue: rawValue) ?? .short }
}

struct TableWidgetIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "터미널과 주차장 묶음"
    @Parameter(title: "터미널", default: .t1) var terminal: TerminalOption
    @Parameter(title: "주차장 묶음", default: .short) var group: GroupOption

    init() {}
}

// MARK: - 데이터

/// 위젯 확장 전용 데이터(앱과 따로 캐시)
enum WidgetData {
    static func load() async -> (ParkingSnapshot, Int)? {
        guard let base = DataConfig.dataBaseURL(bundle: .main),
              let root = try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true),
              let store = try? FileStore(root: root.appendingPathComponent("ICNParkingWidgetData", isDirectory: true)) else { return nil }
        let client = DataClient(baseURL: base, store: store)
        guard let latest = try? await client.latest() else { return nil }
        let now = Date(), kst = ParkingTime.kst(now)
        let days = await client.days(ParkingSnapshot.forecastDates(today: kst.date))
        let freshness = Freshness.of(slot: latest.value.slot, stale: false, now: now, offline: false)
        var minutes = 0
        if case .normal(_, let m) = freshness { minutes = m } else if case .delayed(_, let m) = freshness { minutes = m }
        return (ParkingSnapshot(latest: latest.value, days: days, now: kst.slotTime), minutes)
    }

    static let refresh: TimeInterval = 15 * 60
    static func timeline<E: TimelineEntry>(_ entry: E) -> Timeline<E> { Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(refresh))) }
}

struct ParkingEntry<Model: Sendable>: TimelineEntry {
    let date: Date
    let model: Model?
}

struct SmallProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> ParkingEntry<SmallWidgetModel> { ParkingEntry(date: Date(), model: WidgetSamples.small) }
    func snapshot(for c: SmallWidgetIntent, in context: Context) async -> ParkingEntry<SmallWidgetModel> { context.isPreview ? placeholder(in: context) : await entry(c) }
    func timeline(for c: SmallWidgetIntent, in context: Context) async -> Timeline<ParkingEntry<SmallWidgetModel>> { WidgetData.timeline(await entry(c)) }

    private func entry(_ c: SmallWidgetIntent) async -> ParkingEntry<SmallWidgetModel> {
        let target = c.target?.target ?? .group(.t1, .short)
        guard let (s, ago) = await WidgetData.load() else { return ParkingEntry(date: Date(), model: nil) }
        return ParkingEntry(date: Date(), model: WidgetModels.small(s, target: target, agoMinutes: ago))
    }
}

struct GraphProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> ParkingEntry<GraphWidgetModel> { ParkingEntry(date: Date(), model: WidgetSamples.graph) }
    func snapshot(for c: GraphWidgetIntent, in context: Context) async -> ParkingEntry<GraphWidgetModel> { context.isPreview ? placeholder(in: context) : await entry(c) }
    func timeline(for c: GraphWidgetIntent, in context: Context) async -> Timeline<ParkingEntry<GraphWidgetModel>> { WidgetData.timeline(await entry(c)) }

    private func entry(_ c: GraphWidgetIntent) async -> ParkingEntry<GraphWidgetModel> {
        let target = c.target?.target ?? .group(.t1, .short)
        guard let (s, ago) = await WidgetData.load() else { return ParkingEntry(date: Date(), model: nil) }
        return ParkingEntry(date: Date(), model: WidgetModels.graph(s, target: target, agoMinutes: ago))
    }
}

struct TableProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> ParkingEntry<TableWidgetModel> { ParkingEntry(date: Date(), model: WidgetSamples.table) }
    func snapshot(for c: TableWidgetIntent, in context: Context) async -> ParkingEntry<TableWidgetModel> { context.isPreview ? placeholder(in: context) : await entry(c) }
    func timeline(for c: TableWidgetIntent, in context: Context) async -> Timeline<ParkingEntry<TableWidgetModel>> { WidgetData.timeline(await entry(c)) }

    private func entry(_ c: TableWidgetIntent) async -> ParkingEntry<TableWidgetModel> {
        guard let (s, ago) = await WidgetData.load() else { return ParkingEntry(date: Date(), model: nil) }
        return ParkingEntry(date: Date(), model: WidgetModels.table(s, terminal: c.terminal.terminal, group: c.group.group, agoMinutes: ago))
    }
}

// MARK: - 위젯

struct SmallParkingWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "SmallParkingWidget", intent: SmallWidgetIntent.self, provider: SmallProvider()) { entry in
            SmallWidgetView(model: entry.model)
                .widgetURL(entry.model?.link.url)
                .containerBackground(for: .widget) { WidgetBackground() }
        }
        .configurationDisplayName(Strings.Widget.smallName)
        .description(Strings.Widget.smallDescription)
        .supportedFamilies([.systemSmall])
    }
}

struct GraphParkingWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "GraphParkingWidget", intent: GraphWidgetIntent.self, provider: GraphProvider()) { entry in
            GraphWidgetView(model: entry.model)
                .widgetURL(entry.model?.link.url)
                .containerBackground(for: .widget) { WidgetBackground() }
        }
        .configurationDisplayName(Strings.Widget.mediumName)
        .description(Strings.Widget.mediumDescription)
        .supportedFamilies([.systemMedium])
    }
}

struct TableParkingWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "TableParkingWidget", intent: TableWidgetIntent.self, provider: TableProvider()) { entry in
            TableWidgetView(model: entry.model)
                .widgetURL(entry.model?.link.url)
                .containerBackground(for: .widget) { WidgetBackground() }
        }
        .configurationDisplayName(Strings.Widget.largeName)
        .description(Strings.Widget.largeDescription)
        .supportedFamilies([.systemLarge])
    }
}

/// 디자인: iOS 위젯 바탕 = surface
struct WidgetBackground: View {
    @Environment(\.colorScheme) private var colorScheme
    var body: some View { Theme(mode: colorScheme == .dark ? .dark : .light).p.surface.color }
}
