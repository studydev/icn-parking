import ICNParkingCore
import SwiftUI

@main
struct ICNParkingApp: App {
    @State private var model = AppModel.live()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
        }
    }
}

enum AppTab: Hashable, CaseIterable {
    case live, forecast, history, shuttle, settings

    var title: String {
        switch self {
        case .live: return Strings.Tab.live
        case .forecast: return Strings.Tab.forecast
        case .history: return Strings.Tab.history
        case .shuttle: return Strings.Tab.shuttle
        case .settings: return Strings.Tab.settings
        }
    }

    var headerTitle: String {
        switch self {
        case .live: return Strings.Title.live
        case .forecast: return Strings.Title.forecast
        case .history: return Strings.Title.history
        case .shuttle: return Strings.Title.shuttle
        case .settings: return Strings.Title.settings
        }
    }

    /// README 하단 탭 아이콘(SF Symbols)
    var symbol: String {
        switch self {
        case .live: return "p.square"
        case .forecast: return "clock"
        case .history: return "chart.xyaxis.line"
        case .shuttle: return "bus"
        case .settings: return "slider.horizontal.3"
        }
    }

    /// 헤더 점유율|주차면 토글: 설정·셔틀 탭에선 숨김
    var showsUnit: Bool { self != .settings && self != .shuttle }
    /// 헤더 T1|T2·상단 줄: 설정 탭에선 숨김
    var showsTerminal: Bool { self != .settings }
}

/// 공통 프레임: 헤더(50) → 상단 줄(30) → 본문(좌우 16) → 하단 탭
struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.colorScheme) private var colorScheme
    @State private var tab: AppTab = .live
    @State private var showWidgetGallery = false

    var body: some View {
        @Bindable var model = model
        let theme = Theme(mode: colorScheme == .dark ? .dark : .light)
        TabView(selection: $tab) {
            ForEach(AppTab.allCases, id: \.self) { item in
                TabScreen(tab: item)
                    .tabItem { Label(item.title, systemImage: item.symbol) }
                    .tag(item)
            }
        }
        .tint(theme.p.tint.color)
        .environment(\.theme, theme)
        .fullScreenCover(isPresented: $showWidgetGallery) { WidgetGallery().environment(\.theme, theme) }
        .sheet(item: $model.sheet) { target in
            SheetView(target: target)
                .environment(\.theme, theme)
                .presentationDetents([.fraction(0.88)])
                .presentationCornerRadius(14)
                .presentationBackground(theme.p.sheet.color)
        }
        .onAppear(perform: applyDebugLaunchArguments)
        .onOpenURL { url in
            if let link = DeepLink(url: url) { open(link) }
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await model.refresh()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                await model.tick()
            }
        }
    }
}

extension RootView {
    /// icnparking:// 딥링크(위젯 탭·외부 링크)
    func open(_ link: DeepLink) { tab = model.open(link) }

    /// 개발용: 시뮬레이터 스크린샷에서 탭·시트를 바로 연다(-ICNInitialTab forecast, -ICNInitialSheet t1-short-b2). 딥링크는 6단계
    private func applyDebugLaunchArguments() {
        #if DEBUG
        let defaults = UserDefaults.standard
        if let name = defaults.string(forKey: "ICNInitialTab"), let t = AppTab.allCases.first(where: { "\($0)" == name }) { tab = t }
        if defaults.bool(forKey: "ICNWidgetGallery") { showWidgetGallery = true }
        if let id = defaults.string(forKey: "ICNInitialSheet") {
            Task {
                while model.snapshot == nil { try? await Task.sleep(for: .milliseconds(200)) }
                model.sheet = .zone(id)
            }
        }
        #endif
    }
}

struct TabScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let tab: AppTab

    var body: some View {
        @Bindable var model = model
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Text(tab.headerTitle)
                    .scaledFont(20, .bold, relativeTo: .title3)
                    .tracking(-0.5)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .dynamicTypeSize(...DynamicTypeSize.accessibility1)
                    .accessibilityAddTraits(.isHeader)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if tab.showsUnit {
                    Segmented(items: [(DisplayUnit.occupancy, Strings.Header.unitOccupancy), (.available, Strings.Header.unitAvailable)], selection: $model.unit)
                }
                if tab.showsTerminal {
                    Segmented(items: [(Terminal.t1, Strings.Header.terminal1), (.t2, Strings.Header.terminal2)], selection: $model.terminal)
                }
            }
            .frame(height: 50)
            .padding(.leading, 18)
            .padding(.trailing, 16)
            if tab.showsTerminal { MetaBar(tab: tab) }
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .foregroundStyle(theme.p.ink.color)
        .background(theme.p.bg.color)
    }

    @ViewBuilder
    private var content: some View {
        switch (tab, model.phase) {
        case (.settings, _): SettingsView()
        case (.shuttle, _): ShuttleView()
        case (_, .notConfigured): Message(text: Strings.Error.notConfigured, symbol: "gearshape")
        case (_, .loading): LoadingSkeleton()
        case (_, .failed):
            Message(text: Strings.Error.unavailable, symbol: "wifi.slash") {
                Button(Strings.Error.retry) { Task { await model.refresh(force: true) } }
            }
        case (.live, .loaded): LiveView()
        case (.forecast, .loaded): ForecastView()
        case (.history, .loaded): HistoryView()
        default: EmptyView()
        }
    }
}

/// 상단 줄: "14:30 기준 · 2분 전" · 범례 · 새로고침. 지연·오프라인이면 warn 색
struct MetaBar: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let tab: AppTab

    var body: some View {
        let freshness = model.freshness
        let warn = tab != .shuttle && freshness?.isWarning == true
        HStack(spacing: 10) {
            Text(text(freshness))
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity, alignment: .leading)
            if tab != .shuttle { LegendScale() }
            if tab != .shuttle {
                Button {
                    Task { await model.refresh(force: true) }
                } label: {
                    Text(model.refreshing ? Strings.Meta.refreshing : Strings.Meta.refresh)
                        .padding(.vertical, 6)
                        .padding(.leading, 10)
                }
                .buttonStyle(.plain)
            }
        }
        .font(.num(12.5, .semibold))
        .foregroundStyle(warn ? theme.p.warnInk.color : theme.p.muted.color)
        .padding(.horizontal, 10)
        .frame(height: 30)
        .background {
            if warn {
                RoundedRectangle(cornerRadius: 9).fill(theme.p.warnBg.color)
                    .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(theme.p.warnLine.color, lineWidth: 1))
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 4)
    }

    private func text(_ f: Freshness?) -> String {
        if tab == .shuttle { return Strings.Meta.shuttleNow(time: hm(model.kstNow.secondsOfDay)) }
        if model.phase == .loading { return Strings.Meta.loading }
        return f?.text ?? ""
    }

    private func hm(_ seconds: Int) -> String { ShuttleText.hm(seconds / 60) }
}

/// 첫 로딩: 회색 스켈레톤 + 안내(디자인 5l)
struct LoadingSkeleton: View {
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(spacing: 0) {
            RoundedRectangle(cornerRadius: 8).fill(theme.p.track.color)
                .frame(height: 26).frame(maxWidth: .infinity, alignment: .leading)
                .containerRelativeFrame(.horizontal) { w, _ in w * 0.6 }
                .padding(.init(top: 2, leading: 4, bottom: 10, trailing: 4))
                .frame(maxWidth: .infinity, alignment: .leading)
            GeometryReader { geo in
                VStack(spacing: 8) {
                    RoundedRectangle(cornerRadius: 14).fill(theme.p.track.color).frame(height: (geo.size.height - 8) * 1.1 / 2.1)
                    RoundedRectangle(cornerRadius: 14).fill(theme.p.track.color)
                }
            }
            Text(Strings.Loading.parking).font(.system(size: 13)).foregroundStyle(theme.p.muted.color).padding(.top, 10)
        }
        .padding(.init(top: 6, leading: 16, bottom: 12, trailing: 16))
        .accessibilityElement(children: .combine)
    }
}

struct Message<Actions: View>: View {
    @Environment(\.theme) private var theme
    let text: String
    let symbol: String
    @ViewBuilder var actions: () -> Actions

    var body: some View {
        ContentUnavailableView {
            Label(text, systemImage: symbol)
        } actions: {
            actions()
        }
        .foregroundStyle(theme.p.muted.color)
    }
}

extension Message where Actions == EmptyView {
    init(text: String, symbol: String) {
        self.init(text: text, symbol: symbol) { EmptyView() }
    }
}
