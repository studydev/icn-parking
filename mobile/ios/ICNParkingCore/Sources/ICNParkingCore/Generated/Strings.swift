// 생성 파일 — 직접 고치지 마세요.
// 원본: mobile/shared/strings.ko.json · node mobile/shared/scripts/generate.mjs

public enum Strings {
    public enum App {
        public static let name = "ICN 공항 주차"
    }
    public enum Tab {
        public static let live = "실시간"
        public static let forecast = "예측"
        public static let history = "히스토리"
        public static let shuttle = "셔틀"
        public static let settings = "설정"
    }
    public enum Title {
        public static let live = "실시간 현황"
        public static let forecast = "시간별 예측"
        public static let history = "히스토리"
        public static let shuttle = "셔틀"
        public static let settings = "설정"
    }
    public enum Header {
        public static let unitOccupancy = "점유율"
        public static let unitAvailable = "주차면"
        public static let terminal1 = "T1"
        public static let terminal2 = "T2"
        public static let terminal1Long = "제1터미널"
        public static let terminal2Long = "제2터미널"
    }
    public enum Meta {
        public static func updated(time: String, ago: String) -> String { "\(time) 기준 · \(ago)" }
        public static let justNow = "방금"
        public static func minutesAgo(minutes: String) -> String { "\(minutes)분 전" }
        public static func delayed(minutes: String, time: String) -> String { "수집 \(minutes)분 지연 · \(time) 기준" }
        public static func offline(time: String) -> String { "오프라인 · \(time) 저장본" }
        public static let loading = "불러오는 중…"
        public static let refresh = "↻ 새로고침"
        public static let refreshing = "갱신 중…"
        public static let legendLow = "여유"
        public static let legendHigh = "만차"
        public static let legendA11y = "색 범례: 여유에서 만차"
        public static func shuttleNow(time: String) -> String { "시간표 기준 · 지금 \(time)" }
    }
    public enum Loading {
        public static let parking = "최신 주차 정보를 불러오고 있어요"
        public static let shuttle = "셔틀 시간표를 불러오고 있어요"
    }
    public enum Unit {
        public static let cars = "대"
        public static let percent = "%"
        public static let carsLeft = "대 남음"
        public static let percentUsed = "% 사용 중"
    }
    public enum Zone {
        public static let closed = "운영 중단"
        public static let missing = "확인 필요"
        public static let full = "만차"
        public static let ground = "지면"
        public static func a11yAvailable(name: String, cars: String) -> String { "\(name), 남은 \(cars)대" }
        public static func a11yState(name: String, state: String) -> String { "\(name), \(state)" }
    }
    public enum Live {
        public static func totalTitle(terminal: String) -> String { "\(terminal) 전체 · 예약 제외" }
        public static let groupShort = "단기주차장"
        public static let groupLong = "장기주차장 · 주차타워"
    }
    public enum Forecast {
        public static let now = "지금"
        public static let total = "전체"
        public static func totalA11y(terminal: String) -> String { "\(terminal) 전체" }
        public static let sectionShort = "단기주차장"
        public static let sectionLong = "장기주차장 · 주차타워"
        public static let reasonUnavailable = "예측 불가"
        public static let reasonCapacityChanged = "면수 변경 · 예상 중지"
        public static let reasonClosed = "운영 중단"
        public static let reasonMissing = "현재값 없음"
        public static let whyClosed = "운영 중단 구역이에요. 지금은 주차할 수 없어요."
        public static let whyMissing = "현재값이 들어오지 않아 남은 대수와 예상을 보여드릴 수 없어요."
        public static let whyNoHistory = "예측 불가 · 지난 4주 같은 요일·시각 기록이 없어요."
        public static func whyCapacityChanged(from: String, to: String) -> String { "운영 면수가 바뀐 직후(\(from) → \(to)대)라 예상을 잠시 멈췄어요." }
        public static let whyCapacityUnknown = "지금 운영 면수를 확인할 수 없어 예상을 만들 수 없어요."
        public static func deltaUp(amount: String) -> String { "▲\(amount)" }
        public static func deltaDown(amount: String) -> String { "▼\(amount)" }
        public static let deltaZero = "±0"
        public static func a11yNow(cars: String) -> String { "지금 남은 \(cars)대" }
        public static func a11yCell(time: String, cars: String, change: String) -> String { "\(time) 예상 남은 \(cars)대, 지금보다 \(change)" }
        public static func changeUp(cars: String) -> String { "\(cars)대 증가" }
        public static func changeDown(cars: String) -> String { "\(cars)대 감소" }
        public static let changeNone = "변화 없음"
    }
    public enum Sheet {
        public static let close = "닫기"
        public static func kickerGroup(terminal: String) -> String { "\(terminal) · 그룹 합계" }
        public static func kickerZone(terminal: String, category: String) -> String { "\(terminal) · \(category)주차장" }
        public static func kickerTower(terminal: String) -> String { "\(terminal) · 장기 주차타워" }
        public static func groupName(group: String) -> String { "\(group) 전체" }
        public static let remaining = "남은"
        public static func ofTotal(cars: String) -> String { "/ 전체 \(cars)대" }
        public static func bandPercent(band: String, percent: String) -> String { "\(band) · \(percent)%" }
        public static let legendActual = "지난 2시간 실측"
        public static let legendForecast = "6시간 예상"
        public static let legendLastWeek = "지난주 같은 시각"
        public static func nowMarker(time: String) -> String { "지금 \(time)" }
        public static func explain(weeksAgo: String, weekday: String, date: String, diff: String) -> String { "\(weeksAgo) \(weekday)(\(date)) 같은 시각 흐름에 지금 차이(\(diff)대)를 더한 참고 예상이에요." }
        public static let lastWeek = "지난주"
        public static func weeksAgo(weeks: String) -> String { "\(weeks)주 전" }
        public static let explainGroup = "구역마다 지난 1~4주 같은 요일 흐름에 지금 차이를 더한 참고 예상을 합쳤어요. 예상이 없는 구역은 지금 값을 그대로 더해요."
        public static func footerGroup(updated: String) -> String { "\(updated) · 30분 간격" }
        public static func a11yGraph(now: String, later: String) -> String { "지금 남은 \(now)대, 6시간 뒤 \(later)대 예상" }
        public static let timelineTitle = "시간대별 예상 남은 면수"
        public static let timelineNote = "앞 열이 선택한 곳이에요. 칸을 누르면 그 주차장을 봐요."
        public static func footer(updated: String, date: String, weekday: String) -> String { "\(updated) · 30분 간격 · 비교 주 \(date)(\(weekday))" }
        public static let footerGroupSuffix = " · 운영 중단·현재값 없는 구역 제외"
    }
    public enum Weekday {
        public static let long: [String] = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"]
        public static let short: [String] = ["일", "월", "화", "수", "목", "금", "토"]
    }
    public enum History {
        public static func days(count: String) -> String { "\(count)일" }
        public static let groupShort = "단기"
        public static let groupLong = "장기"
        public static let groupReserved = "예약"
        public static let all = "전체"
        public static let now = "지금"
        public static func summaryOccupancy(name: String, average: String, max: String, fullHours: String) -> String { "\(name) · 평균 \(average)% · 최고 \(max)% · 만차 \(fullHours)시간" }
        public static func summaryAvailable(name: String, average: String, min: String, fullHours: String) -> String { "\(name) · 평균 \(average)대 · 최저 \(min)대 · 만차 \(fullHours)시간" }
        public static let dailyMaxOccupancy = "일별 최고 점유율"
        public static let dailyMinAvailable = "일별 최저 남은 면수"
        public static func dailyRange(from: String, to: String) -> String { "\(from) – \(to) · 탭하면 그래프 강조" }
        public static let noData = "이 기간 기록이 없어요"
        public static func a11yCellOccupancy(date: String, percent: String) -> String { "\(date) 최고 점유율 \(percent)%" }
        public static func a11yCellAvailable(date: String, cars: String) -> String { "\(date) 최저 남은 면수 \(cars)대" }
    }
    public enum Shuttle {
        public static func routeInfo(desc: String, headway: String, hours: String) -> String { "\(desc) · 배차 \(headway) · \(hours)" }
        public static func minutes(minutes: String) -> String { "\(minutes)분" }
        public static func hoursMinutes(hours: String, minutes: String) -> String { "\(hours)시간 \(minutes)분" }
        public static func after(wait: String) -> String { "\(wait) 후" }
        public static let arriving = "곧 도착"
        public static let tomorrow = "내일"
        public static func tomorrowAt(time: String) -> String { "내일 \(time)" }
        public static func arrivalAt(time: String) -> String { "\(time) 도착 예정" }
        public static let nextBus = "그다음 차"
        public static func nextBusAt(time: String) -> String { "\(time) 그다음 차" }
        public static func markNotice(mark: String) -> String { "※ 이번 차는 \(mark)" }
        public static func firstLast(first: String, last: String) -> String { "첫차 \(first) · 막차 \(last)" }
        public static let allDay = "24시간 운행 · 심야엔 배차가 길어요"
        public static func stopsHeader(count: String) -> String { "정차 순서 · \(count)개 승강장" }
        public static let nextArrival = "다음 도착"
        public static let none = "—"
        public static func loopTail(stop: String, duration: String) -> String { "↻ \(stop)(으)로 돌아와 순환 · \(duration)" }
        public static func afterTail(after: String) -> String { "… \(after)" }
        public static func asOf(asOf: String) -> String { "\(asOf) 시간표 기준 · 실제 운행과 차이가 날 수 있어요" }
        public static func a11yStop(route: String, stop: String, wait: String, time: String) -> String { "\(route) \(stop), \(wait) 후 \(time) 도착 예정" }
    }
    public enum Settings {
        public static let defaultTerminal = "기본 터미널"
        public static let display = "표시"
        public static let showDelta = "예측 칸에 ▲▼ 변화량 표시"
        public static let info = "안내"
        public static let dataSource = "데이터 출처"
        public static let dataSourceBody = "공공데이터포털 · 인천국제공항공사 주차장 정보 (5분 간격)"
        public static let affiliation = "운영 주체"
        public static let affiliationBody = "인천국제공항공사와 제휴하지 않은 독립 서비스예요. 공개된 공공데이터를 사용해요."
        public static let forecastLimit = "예상의 한계"
        public static let forecastLimitBody = "지난주 같은 요일·시각 흐름에 지금 차이를 더한 참고값이에요. 항공편 지연·면수 조정·행사는 반영하지 못해요."
        public static let openSource = "소스 코드 (GitHub)"
        public static let openSourceLabel = "github.com/studydev/icn-parking"
        public static let openSourceUrl = "https://github.com/studydev/icn-parking"
        public static let web = "웹에서 자세히 보기"
        public static let webBaseUrl = "https://icn.igotobook.com/"
        public static let webHome = "웹사이트 열기"
        public static let webHomeBody = "icn.igotobook.com · 실제 운영 중인 서비스"
        public static let webStatus = "주차장 현황·예측 그래프"
        public static let webStatusBody = "구역별 그래프, 비교 주, IGoTo 예측"
        public static let webHistory = "날짜별·기간별 기록"
        public static let webHistoryBody = "지난 기록을 날짜·기간으로 비교"
        public static let webShuttle = "터미널 이동·셔틀 노선도"
        public static let webShuttleBody = "노선도와 정류장별 시간표"
        public static let webFees = "주차요금 계산"
        public static let webFeesBody = "주차 기간·차종별 요금 계산"
        public static func privacy(version: String) -> String { "로그인·위치 정보를 사용하지 않아요 · \(version)" }
    }
    public enum Error {
        public static let notConfigured = "데이터 주소가 설정되지 않았어요"
        public static let unavailable = "주차 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
        public static let retry = "다시 시도"
    }
    public enum Widget {
        public static let galleryName = "ICN 공항 주차"
        public static let galleryDescription = "주차장 남은 면수와 30분 간격 참고 예상"
        public static let smallName = "주차장 남은 면수"
        public static let smallDescription = "주차장 한 곳의 남은 면수와 1시간 뒤 참고 예상"
        public static let mediumName = "3시간 예상 그래프"
        public static let mediumDescription = "주차장 한 곳의 30분 간격 3시간 예상 남은 면수"
        public static let largeName = "주차장별 예상"
        public static let largeDescription = "터미널 단기·장기 주차장별 지금과 1·2·3시간 뒤"
        public static let graphSubtitle = "3시간 예상 · 30분 간격"
        public static let tableSubtitle = "지금 · 1·2·3시간 뒤"
        public static let groupParameter = "주차장 묶음"
        public static let configTitle = "위젯에 보여 줄 주차장"
        public static let targetParameter = "주차장"
        public static let terminalParameter = "터미널"
        public static let inOneHourPrefix = "1시간 뒤"
        public static func inOneHour(delta: String) -> String { "1시간 뒤 \(delta)대" }
        public static func updatedAgo(ago: String) -> String { "\(ago) 기준" }
        public static let total = "전체"
    }
}
