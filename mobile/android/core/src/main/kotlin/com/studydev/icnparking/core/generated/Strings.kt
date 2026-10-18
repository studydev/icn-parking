// 생성 파일 — 직접 고치지 마세요.
// 원본: mobile/shared/strings.ko.json · node mobile/shared/scripts/generate.mjs
package com.studydev.icnparking.core.generated

object Strings {
    object App {
        const val name = "ICN 공항 주차"
    }
    object Tab {
        const val live = "실시간"
        const val forecast = "예측"
        const val history = "히스토리"
        const val shuttle = "셔틀"
        const val settings = "설정"
    }
    object Title {
        const val live = "실시간 현황"
        const val forecast = "시간별 예측"
        const val history = "히스토리"
        const val shuttle = "셔틀"
        const val settings = "설정"
    }
    object Header {
        const val unitOccupancy = "점유율"
        const val unitAvailable = "주차면"
        const val terminal1 = "T1"
        const val terminal2 = "T2"
        const val terminal1Long = "제1터미널"
        const val terminal2Long = "제2터미널"
    }
    object Meta {
        fun updated(time: String, ago: String): String = "${time} 기준 · ${ago}"
        const val justNow = "방금"
        fun minutesAgo(minutes: String): String = "${minutes}분 전"
        fun delayed(minutes: String, time: String): String = "수집 ${minutes}분 지연 · ${time} 기준"
        fun offline(time: String): String = "오프라인 · ${time} 저장본"
        const val loading = "불러오는 중…"
        const val refresh = "↻ 새로고침"
        const val refreshing = "갱신 중…"
        const val legendLow = "여유"
        const val legendHigh = "만차"
        const val legendA11y = "색 범례: 여유에서 만차"
        fun shuttleNow(time: String): String = "시간표 기준 · 지금 ${time}"
    }
    object Loading {
        const val parking = "최신 주차 정보를 불러오고 있어요"
        const val shuttle = "셔틀 시간표를 불러오고 있어요"
    }
    object Unit {
        const val cars = "대"
        const val percent = "%"
        const val carsLeft = "대 남음"
        const val percentUsed = "% 사용 중"
    }
    object Zone {
        const val closed = "운영 중단"
        const val missing = "확인 필요"
        const val full = "만차"
        const val ground = "지면"
        fun a11yAvailable(name: String, cars: String): String = "${name}, 남은 ${cars}대"
        fun a11yState(name: String, state: String): String = "${name}, ${state}"
    }
    object Live {
        fun totalTitle(terminal: String): String = "${terminal} 전체 · 예약 제외"
        const val groupShort = "단기주차장"
        const val groupLong = "장기주차장 · 주차타워"
    }
    object Forecast {
        const val now = "지금"
        const val total = "전체"
        fun totalA11y(terminal: String): String = "${terminal} 전체"
        const val sectionShort = "단기주차장"
        const val sectionLong = "장기주차장 · 주차타워"
        const val reasonUnavailable = "예측 불가"
        const val reasonCapacityChanged = "면수 변경 · 예상 중지"
        const val reasonClosed = "운영 중단"
        const val reasonMissing = "현재값 없음"
        const val whyClosed = "운영 중단 구역이에요. 지금은 주차할 수 없어요."
        const val whyMissing = "현재값이 들어오지 않아 남은 대수와 예상을 보여드릴 수 없어요."
        const val whyNoHistory = "예측 불가 · 지난 4주 같은 요일·시각 기록이 없어요."
        fun whyCapacityChanged(from: String, to: String): String = "운영 면수가 바뀐 직후(${from} → ${to}대)라 예상을 잠시 멈췄어요."
        const val whyCapacityUnknown = "지금 운영 면수를 확인할 수 없어 예상을 만들 수 없어요."
        fun deltaUp(amount: String): String = "▲${amount}"
        fun deltaDown(amount: String): String = "▼${amount}"
        const val deltaZero = "±0"
        fun a11yNow(cars: String): String = "지금 남은 ${cars}대"
        fun a11yCell(time: String, cars: String, change: String): String = "${time} 예상 남은 ${cars}대, 지금보다 ${change}"
        fun changeUp(cars: String): String = "${cars}대 증가"
        fun changeDown(cars: String): String = "${cars}대 감소"
        const val changeNone = "변화 없음"
    }
    object Sheet {
        const val close = "닫기"
        fun kickerGroup(terminal: String): String = "${terminal} · 그룹 합계"
        fun kickerZone(terminal: String, category: String): String = "${terminal} · ${category}주차장"
        fun kickerTower(terminal: String): String = "${terminal} · 장기 주차타워"
        fun groupName(group: String): String = "${group} 전체"
        const val remaining = "남은"
        fun ofTotal(cars: String): String = "/ 전체 ${cars}대"
        fun bandPercent(band: String, percent: String): String = "${band} · ${percent}%"
        const val legendActual = "지난 2시간 실측"
        const val legendForecast = "6시간 예상"
        const val legendLastWeek = "지난주 같은 시각"
        fun nowMarker(time: String): String = "지금 ${time}"
        fun explain(weeksAgo: String, weekday: String, date: String, diff: String): String = "${weeksAgo} ${weekday}(${date}) 같은 시각 흐름에 지금 차이(${diff}대)를 더한 참고 예상이에요."
        const val lastWeek = "지난주"
        fun weeksAgo(weeks: String): String = "${weeks}주 전"
        const val explainGroup = "구역마다 지난 1~4주 같은 요일 흐름에 지금 차이를 더한 참고 예상을 합쳤어요. 예상이 없는 구역은 지금 값을 그대로 더해요."
        fun footerGroup(updated: String): String = "${updated} · 30분 간격"
        fun a11yGraph(now: String, later: String): String = "지금 남은 ${now}대, 6시간 뒤 ${later}대 예상"
        const val timelineTitle = "시간대별 예상 남은 면수"
        const val timelineNote = "앞 열이 선택한 곳이에요. 칸을 누르면 그 주차장을 봐요."
        fun footer(updated: String, date: String, weekday: String): String = "${updated} · 30분 간격 · 비교 주 ${date}(${weekday})"
        const val footerGroupSuffix = " · 운영 중단·현재값 없는 구역 제외"
    }
    object Weekday {
        val long: List<String> = listOf("일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일")
        val short: List<String> = listOf("일", "월", "화", "수", "목", "금", "토")
    }
    object History {
        fun days(count: String): String = "${count}일"
        const val groupShort = "단기"
        const val groupLong = "장기"
        const val groupReserved = "예약"
        const val all = "전체"
        const val now = "지금"
        fun summaryOccupancy(name: String, average: String, max: String, fullHours: String): String = "${name} · 평균 ${average}% · 최고 ${max}% · 만차 ${fullHours}시간"
        fun summaryAvailable(name: String, average: String, min: String, fullHours: String): String = "${name} · 평균 ${average}대 · 최저 ${min}대 · 만차 ${fullHours}시간"
        const val dailyMaxOccupancy = "일별 최고 점유율"
        const val dailyMinAvailable = "일별 최저 남은 면수"
        fun dailyRange(from: String, to: String): String = "${from} – ${to} · 탭하면 그래프 강조"
        const val noData = "이 기간 기록이 없어요"
        fun a11yCellOccupancy(date: String, percent: String): String = "${date} 최고 점유율 ${percent}%"
        fun a11yCellAvailable(date: String, cars: String): String = "${date} 최저 남은 면수 ${cars}대"
    }
    object Shuttle {
        fun routeInfo(desc: String, headway: String, hours: String): String = "${desc} · 배차 ${headway} · ${hours}"
        fun minutes(minutes: String): String = "${minutes}분"
        fun hoursMinutes(hours: String, minutes: String): String = "${hours}시간 ${minutes}분"
        fun after(wait: String): String = "${wait} 후"
        const val arriving = "곧 도착"
        const val tomorrow = "내일"
        fun tomorrowAt(time: String): String = "내일 ${time}"
        fun arrivalAt(time: String): String = "${time} 도착 예정"
        const val nextBus = "그다음 차"
        fun nextBusAt(time: String): String = "${time} 그다음 차"
        fun markNotice(mark: String): String = "※ 이번 차는 ${mark}"
        fun firstLast(first: String, last: String): String = "첫차 ${first} · 막차 ${last}"
        const val allDay = "24시간 운행 · 심야엔 배차가 길어요"
        fun stopsHeader(count: String): String = "정차 순서 · ${count}개 승강장"
        const val nextArrival = "다음 도착"
        const val none = "—"
        fun loopTail(stop: String, duration: String): String = "↻ ${stop}(으)로 돌아와 순환 · ${duration}"
        fun afterTail(after: String): String = "… ${after}"
        fun asOf(asOf: String): String = "${asOf} 시간표 기준 · 실제 운행과 차이가 날 수 있어요"
        fun a11yStop(route: String, stop: String, wait: String, time: String): String = "${route} ${stop}, ${wait} 후 ${time} 도착 예정"
    }
    object Settings {
        const val defaultTerminal = "기본 터미널"
        const val display = "표시"
        const val showDelta = "예측 칸에 ▲▼ 변화량 표시"
        const val info = "안내"
        const val dataSource = "데이터 출처"
        const val dataSourceBody = "공공데이터포털 · 인천국제공항공사 주차장 정보 (5분 간격)"
        const val affiliation = "운영 주체"
        const val affiliationBody = "인천국제공항공사와 제휴하지 않은 독립 서비스예요. 공개된 공공데이터를 사용해요."
        const val forecastLimit = "예상의 한계"
        const val forecastLimitBody = "지난주 같은 요일·시각 흐름에 지금 차이를 더한 참고값이에요. 항공편 지연·면수 조정·행사는 반영하지 못해요."
        const val openSource = "소스 코드 (GitHub)"
        const val openSourceLabel = "github.com/studydev/icn-parking"
        const val openSourceUrl = "https://github.com/studydev/icn-parking"
        const val web = "웹에서 자세히 보기"
        const val webBaseUrl = "https://icn.igotobook.com/"
        const val webHome = "웹사이트 열기"
        const val webHomeBody = "icn.igotobook.com · 실제 운영 중인 서비스"
        const val webStatus = "주차장 현황·예측 그래프"
        const val webStatusBody = "구역별 그래프, 비교 주, IGoTo 예측"
        const val webHistory = "날짜별·기간별 기록"
        const val webHistoryBody = "지난 기록을 날짜·기간으로 비교"
        const val webShuttle = "터미널 이동·셔틀 노선도"
        const val webShuttleBody = "노선도와 정류장별 시간표"
        const val webFees = "주차요금 계산"
        const val webFeesBody = "주차 기간·차종별 요금 계산"
        fun privacy(version: String): String = "로그인·위치 정보를 사용하지 않아요 · ${version}"
    }
    object Error {
        const val notConfigured = "데이터 주소가 설정되지 않았어요"
        const val unavailable = "주차 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
        const val retry = "다시 시도"
    }
    object Widget {
        const val galleryName = "ICN 공항 주차"
        const val galleryDescription = "주차장 남은 면수와 30분 간격 참고 예상"
        const val smallName = "주차장 남은 면수"
        const val smallDescription = "주차장 한 곳의 남은 면수와 1시간 뒤 참고 예상"
        const val mediumName = "3시간 예상 그래프"
        const val mediumDescription = "주차장 한 곳의 30분 간격 3시간 예상 남은 면수"
        const val largeName = "주차장별 예상"
        const val largeDescription = "터미널 단기·장기 주차장별 지금과 1·2·3시간 뒤"
        const val graphSubtitle = "3시간 예상 · 30분 간격"
        const val tableSubtitle = "지금 · 1·2·3시간 뒤"
        const val groupParameter = "주차장 묶음"
        const val configTitle = "위젯에 보여 줄 주차장"
        const val targetParameter = "주차장"
        const val terminalParameter = "터미널"
        const val inOneHourPrefix = "1시간 뒤"
        fun inOneHour(delta: String): String = "1시간 뒤 ${delta}대"
        fun updatedAgo(ago: String): String = "${ago} 기준"
        const val total = "전체"
    }
}
