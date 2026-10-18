import Foundation

/// 날짜는 웹과 같이 "YYYY-MM-DD" 문자열로 다룬다(문자열 비교 = 날짜 비교). Calendar·시간대 없이 epoch-day로 계산.
public enum LocalDate {
    public static func epochDay(_ date: String) -> Int {
        let parts = date.split(separator: "-").compactMap { Int($0) }
        precondition(parts.count == 3, "날짜 형식 YYYY-MM-DD: \(date)")
        return daysFromCivil(year: parts[0], month: parts[1], day: parts[2])
    }

    public static func string(epochDay: Int) -> String {
        let (y, m, d) = civilFromDays(epochDay)
        return String(format: "%04d-%02d-%02d", y, m, d)
    }

    public static func addDays(_ date: String, _ n: Int) -> String { string(epochDay: epochDay(date) + n) }

    /// 0 = 일요일
    public static func weekday(_ date: String) -> Int { floorMod(epochDay(date) + 4, 7) }

    // Howard Hinnant, chrono-compatible low-level date algorithms
    static func daysFromCivil(year: Int, month: Int, day: Int) -> Int {
        let y = month <= 2 ? year - 1 : year
        let era = floorDiv(y, 400)
        let yoe = y - era * 400
        let doy = (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5 + day - 1
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146097 + doe - 719468
    }

    static func civilFromDays(_ z0: Int) -> (Int, Int, Int) {
        let z = z0 + 719468
        let era = floorDiv(z, 146097)
        let doe = z - era * 146097
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        let mp = (5 * doy + 2) / 153
        let d = doy - (153 * mp + 2) / 5 + 1
        let m = mp < 10 ? mp + 3 : mp - 9
        return (yoe + era * 400 + (m <= 2 ? 1 : 0), m, d)
    }
}

func floorDiv(_ a: Int, _ b: Int) -> Int {
    let q = a / b
    return a % b != 0 && (a < 0) != (b < 0) ? q - 1 : q
}
func floorMod(_ a: Int, _ b: Int) -> Int { a - floorDiv(a, b) * b }

/// KST 날짜 + 5분 슬롯(0 = 00:00 … 287 = 23:55)
public struct SlotTime: Codable, Hashable, Sendable {
    public let date: String
    public let slot: Int

    public init(date: String, slot: Int) {
        self.date = date
        self.slot = slot
    }

    /// "HH:MM"
    public var label: String { String(format: "%02d:%02d", slot / 12, (slot % 12) * 5) }
}

public enum ParkingTime {
    public static let slotsPerDay = 288
    static let kstOffset = 9 * 3600

    /// web slotRange: date 기준 i번째 슬롯(음수·288 이상이면 날짜를 넘긴다)
    public static func slotRange(_ date: String, _ i: Int) -> SlotTime {
        SlotTime(date: LocalDate.addDays(date, floorDiv(i, slotsPerDay)), slot: floorMod(i, slotsPerDay))
    }

    public struct KST: Hashable, Sendable {
        public let date: String
        public let slot: Int
        public let secondsOfDay: Int
        public var slotTime: SlotTime { SlotTime(date: date, slot: slot) }
    }

    public static func kst(_ instant: Date) -> KST {
        let seconds = Int(instant.timeIntervalSince1970.rounded(.down)) + kstOffset
        let day = floorDiv(seconds, 86400), sod = seconds - day * 86400
        return KST(date: LocalDate.string(epochDay: day), slot: sod / 300, secondsOfDay: sod)
    }

    /// "YYYY-MM-DDTHH:MM"(KST) → 시각
    public static func instant(ofKSTSlot slot: String) -> Date {
        let date = String(slot.prefix(10))
        let hm = slot.dropFirst(11).split(separator: ":").compactMap { Int($0) }
        let seconds = LocalDate.epochDay(date) * 86400 + hm[0] * 3600 + hm[1] * 60 - kstOffset
        return Date(timeIntervalSince1970: TimeInterval(seconds))
    }
}
