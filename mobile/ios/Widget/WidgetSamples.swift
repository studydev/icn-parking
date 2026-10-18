import ICNParkingCore

/// 위젯 갤러리·자리표시용 고정 예시
enum WidgetSamples {
    static let small = SmallWidgetModel(title: "T1 단기주차장", available: 213, word: nil, occupancy: 0.93, deltaHour: -12,
                                        ago: WidgetModels.ago(minutes: 2), link: .group(.t1, .short))

    static let graph = GraphWidgetModel(
        title: "T1 단기주차장", ago: WidgetModels.ago(minutes: 2),
        points: zip(["지금", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"], [213, 205, 196, 188, 180, 172, 166]).map {
            GraphWidgetModel.Point(label: $0, available: $1, occupancy: 0.93)
        },
        link: .group(.t1, .short))

    static let table = TableWidgetModel(
        title: "T1 단기주차장", ago: WidgetModels.ago(minutes: 2), times: ["15:30", "16:30", "17:30"],
        rows: [
            .init(name: Strings.Widget.total, isTotal: true, available: 213, word: nil, cells: [
                .init(available: 201, delta: -12, occupancy: 0.94), .init(available: 180, delta: -33, occupancy: 0.95), .init(available: 166, delta: -47, occupancy: 0.95),
            ]),
            .init(name: "지상", isTotal: false, available: 60, word: nil, cells: [
                .init(available: 55, delta: -5, occupancy: 0.91), .init(available: 48, delta: -12, occupancy: 0.92), .init(available: 44, delta: -16, occupancy: 0.93),
            ]),
        ],
        link: .forecast(.t1))
}
