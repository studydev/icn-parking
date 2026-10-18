import ICNParkingCore
import SwiftUI

/// 개발용(-ICNWidgetGallery YES): 위젯을 홈 화면에 올리지 않고 실제 데이터로 디자인 5m 크기 그대로 본다
struct WidgetGallery: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        let s = model.snapshot
        let ago = model.freshness.map { f -> Int in
            switch f {
            case .normal(_, let m), .delayed(_, let m): return m
            case .offline: return 0
            }
        } ?? 0
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 18) {
                    tile(width: 158) { SmallWidgetView(model: s.map { WidgetModels.small($0, target: .group(.t1, .short), agoMinutes: ago) } ?? WidgetSamples.small) }
                    tile(width: 158) { SmallWidgetView(model: s.map { WidgetModels.small($0, target: .zone("t1-short-b1"), agoMinutes: ago) } ?? WidgetSamples.small) }
                }
                tile(width: 338) { MediumWidgetView(model: s.map { WidgetModels.medium($0, terminal: .t1, agoMinutes: ago) } ?? WidgetSamples.medium) }
                tile(width: 338) { MediumWidgetView(model: s.map { WidgetModels.medium($0, terminal: .t2, agoMinutes: ago) } ?? WidgetSamples.medium) }
            }
            .padding(28)
        }
        .background(Color(red: 0.8, green: 0.83, blue: 0.86))
    }

    private func tile<Content: View>(width: CGFloat, @ViewBuilder _ content: () -> Content) -> some View {
        content()
            .padding(.init(top: 14, leading: 15, bottom: 14, trailing: 15))
            .frame(width: width, height: 158)
            .background(RoundedRectangle(cornerRadius: 22).fill(theme.p.surface.color))
            .shadow(color: .black.opacity(0.14), radius: 9, y: 6)
    }
}
