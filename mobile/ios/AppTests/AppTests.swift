import Foundation
import ICNParkingCore
import XCTest
@testable import ICNParking

final class AppConfigTests: XCTestCase {
    func testDataBaseURLComesFromBuildSettings() throws {
        // Config/Local.xcconfig가 있으면 실제 값, 없으면 nil(빈 값) — 어느 쪽이든 형식이 맞아야 한다
        if let url = AppConfig.dataBaseURL() {
            XCTAssertEqual(url.scheme, "https")
            XCTAssertTrue(url.absoluteString.hasSuffix("/data/"), url.absoluteString)
            XCTAssertFalse(url.absoluteString.contains("$$"), "xcconfig의 $$ 이스케이프가 풀려야 해요")
        }
    }

    func testDataBaseURLNormalization() {
        XCTAssertNil(AppConfig.dataBaseURL(nil))
        XCTAssertNil(AppConfig.dataBaseURL(["ICNDataBaseURL": ""]))
        XCTAssertNil(AppConfig.dataBaseURL(["ICNDataBaseURL": "$(ICN_DATA_BASE_URL)"]))
        XCTAssertNil(AppConfig.dataBaseURL(["ICNDataBaseURL": "http://example.com/data/"]))
        XCTAssertEqual(AppConfig.dataBaseURL(["ICNDataBaseURL": " https://example.com/$web/data "])?.absoluteString, "https://example.com/$web/data/")
    }
}

@MainActor
final class AppModelTests: XCTestCase {
    func testBundledShuttleIsSharedTimetable() throws {
        let shuttle = try XCTUnwrap(AppModel.bundledShuttle(Bundle(for: AppModel.self)))
        XCTAssertEqual(shuttle.routes.map(\.id), ["01", "02", "03", "04", "05"])
        XCTAssertEqual(shuttle.asOf, "2026-10-01")
    }

    func testWithoutDataURLModelIsNotConfigured() async {
        let model = AppModel(client: nil, shuttle: nil)
        await model.refresh()
        XCTAssertEqual(model.phase, .notConfigured)
        XCTAssertNil(model.freshness)
    }

    func testFreshnessText() {
        XCTAssertEqual(Freshness.normal(time: "14:30", minutes: 2).text, "14:30 기준 · 2분 전")
        XCTAssertEqual(Freshness.normal(time: "14:30", minutes: 0).text, "14:30 기준 · 방금")
        XCTAssertEqual(Freshness.delayed(time: "14:12", minutes: 18).text, "수집 18분 지연 · 14:12 기준")
        XCTAssertEqual(Freshness.offline(time: "14:28").text, "오프라인 · 14:28 저장본")
        XCTAssertFalse(Freshness.normal(time: "14:30", minutes: 2).isWarning)
        XCTAssertTrue(Freshness.offline(time: "14:28").isWarning)
    }
}

@MainActor
final class DeepLinkRoutingTests: XCTestCase {
    private func model() throws -> AppModel {
        let suite = "icn-link-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        addTeardownBlock { defaults.removePersistentDomain(forName: suite) }
        return AppModel(client: nil, shuttle: AppModel.bundledShuttle(Bundle(for: AppModel.self)), settingsStore: SettingsStore(defaults: defaults))
    }

    func testZoneLinkOpensSheetOnItsTerminal() throws {
        let m = try model()
        XCTAssertEqual(m.open(DeepLink(url: URL(string: "icnparking://zone/t2-short-1f")!)!), .live)
        XCTAssertEqual(m.terminal, .t2)
        XCTAssertEqual(m.sheet, .zone("t2-short-1f"))
    }

    func testForecastAndGroupLinks() throws {
        let m = try model()
        XCTAssertEqual(m.open(.group(.t1, .long)), .live)
        XCTAssertEqual(m.sheet, .group(.t1, .long))
        XCTAssertEqual(m.open(.forecast(.t2)), .forecast)
        XCTAssertNil(m.sheet)
        XCTAssertEqual(m.terminal, .t2)
    }

    func testShuttleLinkSelectsRouteAndStop() throws {
        let m = try model()
        XCTAssertEqual(m.open(DeepLink(url: URL(string: "icnparking://shuttle/03/D00343")!)!), .shuttle)
        XCTAssertEqual(m.settings.shuttleRoute(m.terminal), "03")
        XCTAssertEqual(m.settings.shuttleStop("03"), "D00343")
        // 노선에 없는 승강장은 무시, 없는 노선은 바꾸지 않음
        _ = m.open(.shuttle(route: "01", stop: "NOPE"))
        XCTAssertEqual(m.settings.shuttleRoute(m.terminal), "01")
        XCTAssertNil(m.settings.shuttleStop("01"))
        _ = m.open(.shuttle(route: "99", stop: nil))
        XCTAssertEqual(m.settings.shuttleRoute(m.terminal), "01")
    }
}
