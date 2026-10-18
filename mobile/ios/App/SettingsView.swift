import ICNParkingCore
import SwiftUI

/// 설정: 기본 터미널 · 표시 · 안내 · "로그인·위치 정보를 사용하지 않아요 · 버전". iOS 그룹 리스트(r12). 즐겨찾기 없음
struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        @Bindable var model = model
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                caption(Strings.Settings.defaultTerminal)
                Segmented(items: [(Terminal.t1, Strings.Header.terminal1Long), (.t2, Strings.Header.terminal2Long)], selection: $model.settings.defaultTerminal, wide: true)
                    .padding(.horizontal, 16)
                caption(Strings.Settings.display)
                card {
                    Toggle(Strings.Settings.showDelta, isOn: $model.settings.showDelta)
                        .scaledFont(15)
                        .tint(theme.p.tint.color)
                        .padding(.init(top: 9, leading: 16, bottom: 9, trailing: 16))
                }
                caption(Strings.Settings.web)
                card {
                    let t = model.terminal.rawValue
                    webRow(Strings.Settings.webHome, Strings.Settings.webHomeBody, path: "")
                    webRow(Strings.Settings.webStatus, Strings.Settings.webStatusBody, path: "#week/\(t)", divider: true)
                    webRow(Strings.Settings.webHistory, Strings.Settings.webHistoryBody, path: "#day/\(t)", divider: true)
                    webRow(Strings.Settings.webShuttle, Strings.Settings.webShuttleBody, path: "#access/\(t)", divider: true)
                    webRow(Strings.Settings.webFees, Strings.Settings.webFeesBody, path: "fees.html?terminal=\(t)", divider: true)
                }
                caption(Strings.Settings.info)
                card {
                    row(Strings.Settings.dataSource, Strings.Settings.dataSourceBody)
                    row(Strings.Settings.affiliation, Strings.Settings.affiliationBody, divider: true)
                    row(Strings.Settings.forecastLimit, Strings.Settings.forecastLimitBody, divider: true)
                    Link(destination: URL(string: Strings.Settings.openSourceUrl)!) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(Strings.Settings.openSource).scaledFont(15).foregroundStyle(theme.p.ink.color)
                                Text(Strings.Settings.openSourceLabel).scaledFont(13).foregroundStyle(theme.p.muted.color)
                            }
                            Spacer()
                            Text("↗").foregroundStyle(theme.p.faint.color)
                        }
                        .padding(.init(top: 13, leading: 16, bottom: 13, trailing: 16))
                        .overlay(alignment: .top) { Rectangle().fill(theme.p.line.color).frame(height: 1) }
                    }
                }
                Text(Strings.Settings.privacy(version: AppConfig.version))
                    .scaledFont(12)
                    .foregroundStyle(theme.p.faint.color)
                    .padding(.init(top: 14, leading: 20, bottom: 8, trailing: 20))
            }
            .padding(.bottom, 12)
        }
        .dynamicTypeSize(...DynamicTypeSize.accessibility3)
    }

    private func caption(_ text: String) -> some View {
        Text(text)
            .scaledFont(13)
            .foregroundStyle(theme.p.muted.color)
            .padding(.init(top: 18, leading: 32, bottom: 7, trailing: 32))
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(spacing: 0, content: content)
            .background(RoundedRectangle(cornerRadius: 12).fill(theme.p.surface.color))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal, 16)
    }

    /// 웹 페이지 바로 가기(앱은 보기 편한 요약, 자세한 그래프·기록은 웹)
    private func webRow(_ title: String, _ body: String, path: String, divider: Bool = false) -> some View {
        Link(destination: URL(string: Strings.Settings.webBaseUrl + path)!) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).scaledFont(15).foregroundStyle(theme.p.ink.color)
                    Text(body).scaledFont(13).foregroundStyle(theme.p.muted.color)
                }
                Spacer()
                Text("↗").foregroundStyle(theme.p.faint.color)
            }
            .padding(.init(top: 13, leading: 16, bottom: 13, trailing: 16))
            .overlay(alignment: .top) { if divider { Rectangle().fill(theme.p.line.color).frame(height: 1) } }
        }
        .accessibilityHint(Strings.Settings.webBaseUrl)
    }

    private func row(_ title: String, _ body: String, divider: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).scaledFont(15)
            Text(body).scaledFont(13).foregroundStyle(theme.p.muted.color).lineSpacing(3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.init(top: 13, leading: 16, bottom: 13, trailing: 16))
        .overlay(alignment: .top) { if divider { Rectangle().fill(theme.p.line.color).frame(height: 1) } }
    }
}
