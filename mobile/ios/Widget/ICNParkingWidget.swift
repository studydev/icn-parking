import AppIntents
import ICNParkingCore
import SwiftUI
import WidgetKit

// 위젯(디자인 5m). App Group 없이 위젯이 공개 파일을 직접 받는다(확장 자체 캐시, 지난 날짜는 영구 저장).
// 15분마다 다시 그린다. 누르면 icnparking:// 딥링크로 앱의 해당 시트·탭이 열린다.

@main
struct ICNParkingWidgetBundle: WidgetBundle {
    var body: some Widget {
        SmallParkingWidget()
        MediumParkingWidget()
    }
}

// MARK: - 설정(위젯 길게 눌러 편집)
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

enum TerminalOption: String, AppEnum {
    case t1 = "T1", t2 = "T2"
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "터미널"
    static let caseDisplayRepresentations: [TerminalOption: DisplayRepresentation] = [.t1: "T1", .t2: "T2"]
    var terminal: Terminal { self == .t1 ? .t1 : .t2 }
}

struct MediumWidgetIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "터미널"
    @Parameter(title: "터미널", default: .t1) var terminal: TerminalOption

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
}

struct SmallEntry: TimelineEntry {
    let date: Date
    let model: SmallWidgetModel?
}

struct MediumEntry: TimelineEntry {
    let date: Date
    let model: MediumWidgetModel?
}

struct SmallProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> SmallEntry { SmallEntry(date: Date(), model: WidgetSamples.small) }

    func snapshot(for configuration: SmallWidgetIntent, in context: Context) async -> SmallEntry {
        context.isPreview ? placeholder(in: context) : await entry(configuration)
    }

    func timeline(for configuration: SmallWidgetIntent, in context: Context) async -> Timeline<SmallEntry> {
        Timeline(entries: [await entry(configuration)], policy: .after(Date().addingTimeInterval(WidgetData.refresh)))
    }

    private func entry(_ c: SmallWidgetIntent) async -> SmallEntry {
        let target = c.target?.target ?? .group(.t1, .short)
        guard let (s, ago) = await WidgetData.load() else { return SmallEntry(date: Date(), model: nil) }
        return SmallEntry(date: Date(), model: WidgetModels.small(s, target: target, agoMinutes: ago))
    }
}

struct MediumProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> MediumEntry { MediumEntry(date: Date(), model: WidgetSamples.medium) }

    func snapshot(for configuration: MediumWidgetIntent, in context: Context) async -> MediumEntry {
        context.isPreview ? placeholder(in: context) : await entry(configuration)
    }

    func timeline(for configuration: MediumWidgetIntent, in context: Context) async -> Timeline<MediumEntry> {
        Timeline(entries: [await entry(configuration)], policy: .after(Date().addingTimeInterval(WidgetData.refresh)))
    }

    private func entry(_ c: MediumWidgetIntent) async -> MediumEntry {
        guard let (s, ago) = await WidgetData.load() else { return MediumEntry(date: Date(), model: nil) }
        return MediumEntry(date: Date(), model: WidgetModels.medium(s, terminal: c.terminal.terminal, agoMinutes: ago))
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

struct MediumParkingWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "MediumParkingWidget", intent: MediumWidgetIntent.self, provider: MediumProvider()) { entry in
            MediumWidgetView(model: entry.model)
                .widgetURL(entry.model?.link.url)
                .containerBackground(for: .widget) { WidgetBackground() }
        }
        .configurationDisplayName(Strings.Widget.mediumName)
        .description(Strings.Widget.mediumDescription)
        .supportedFamilies([.systemMedium])
    }
}

/// 디자인: iOS 위젯 바탕 = surface
struct WidgetBackground: View {
    @Environment(\.colorScheme) private var colorScheme
    var body: some View { Theme(mode: colorScheme == .dark ? .dark : .light).p.surface.color }
}
