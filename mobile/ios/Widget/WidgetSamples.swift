import ICNParkingCore

/// 위젯 갤러리·자리표시용 고정 예시(디자인 5m 값)
enum WidgetSamples {
    static let small = SmallWidgetModel(title: "T1 단기주차장", available: 213, word: nil, occupancy: 0.93, deltaHour: -12,
                                        ago: WidgetModels.ago(minutes: 2), link: .group(.t1, .short))

    static let medium = MediumWidgetModel(
        title: Strings.Widget.mediumTitle(terminal: "T1"), ago: WidgetModels.ago(minutes: 2),
        rows: [
            .init(name: ZoneGroup.short.label, available: 213, cells: [
                .init(time: "15:30", available: 201, delta: -12, occupancy: 0.94),
                .init(time: "16:30", available: 180, delta: -33, occupancy: 0.95),
                .init(time: "17:30", available: 166, delta: -47, occupancy: 0.95),
            ]),
            .init(name: ZoneGroup.long.label, available: 1120, cells: [
                .init(time: "15:30", available: 1080, delta: -40, occupancy: 0.9),
                .init(time: "16:30", available: 1010, delta: -110, occupancy: 0.91),
                .init(time: "17:30", available: 990, delta: -130, occupancy: 0.92),
            ]),
        ],
        link: .forecast(.t1))
}
