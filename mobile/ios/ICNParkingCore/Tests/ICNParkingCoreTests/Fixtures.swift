import Foundation
import XCTest
@testable import ICNParkingCore

/// mobile/shared/fixtures (node mobile/shared/scripts/fixtures.mjs가 웹 코드 실행 결과로 만든다)
enum Fixtures {
    static let shared = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent() // ICNParkingCoreTests
        .deletingLastPathComponent() // Tests
        .deletingLastPathComponent() // ICNParkingCore
        .deletingLastPathComponent() // ios
        .deletingLastPathComponent() // mobile
        .appendingPathComponent("shared")

    static func load<T: Decodable>(_ type: T.Type, _ path: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(contentsOf: shared.appendingPathComponent(path)))
    }

    static func forecastNames() throws -> [String] {
        try FileManager.default.contentsOfDirectory(atPath: shared.appendingPathComponent("fixtures/forecast").path)
            .filter { $0.hasSuffix(".json") }.sorted()
    }
}

struct ForecastFixture: Decodable {
    struct Kst: Decodable { let date: String; let slot: Int }
    struct Expected: Decodable {
        let zones: [String: ExpectedZone]
        let zonesHourly: [String: ExpectedZone]
        let groups: [String: ExpectedGroup]
    }
    let name: String
    let terminal: String
    let kst: Kst
    let latest: LatestDoc
    let days: [String: DayDoc]
    let expected: Expected
}

struct ExpectedZone: Decodable {
    let ok: Bool
    let reason: String?
    let from: Int?
    let to: Int?
    let anchor: SlotTime?
    let capacity: Int?
    let nowParking: Int?
    let nowAvailable: Int?
    let nowOccupancy: Double?
    let weeksBack: Int?
    let compareDate: String?
    let baseParking: Double?
    let offset: Double?
    let cells: [ExpectedCell]?
}

struct ExpectedCell: Decodable {
    let date: String
    let slot: Int
    let parking: Double?
    let baseParking: Double?
    let available: Double?
    let occupancy: Double?
}

struct ExpectedGroup: Decodable {
    struct Cell: Decodable { let available: Double; let occupancy: Double }
    let capacity: Int
    let available: Int?
    let occupancy: Double?
    let included: [String]
    let missing: Int
    let hasForecast: Bool
    let cells: [Cell]
}

func assertClose(_ a: Double?, _ b: Double?, _ message: @autoclosure () -> String, file: StaticString = #filePath, line: UInt = #line) {
    switch (a, b) {
    case (nil, nil): return
    case let (x?, y?): XCTAssertEqual(x, y, accuracy: 1e-9, message(), file: file, line: line)
    default: XCTFail("\(message()): \(String(describing: a)) ≠ \(String(describing: b))", file: file, line: line)
    }
}

extension ForecastFailure {
    /// fixtures의 reason 문자열
    var fixtureReason: String {
        switch self {
        case .recentClosed: return "recentClosed"
        case .latestClosed: return "latestClosed"
        case .capacityUnknown: return "capacityUnknown"
        case .capacityChanged: return "capacityChanged"
        case .noCurrent: return "noCurrent"
        case .noHistory: return "noHistory"
        }
    }
}
