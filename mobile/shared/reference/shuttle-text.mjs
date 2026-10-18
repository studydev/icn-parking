// 셔틀 탭(5r/5s) 문구 참조 구현. 디자인(ICN Parking App v5.dc.html) wTxt·sv 규칙을 그대로 옮겼다.
// next = web shNext 결과({m, mod, mark, wait, tomorrow}), 시각 계산은 web/shuttle.js와 같다.
const pad = n => String(n).padStart(2, '0');
export const hm = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

/** 목록 오른쪽 "다음 도착" */
export const waitText = d => !d ? '—' : d.tomorrow ? `내일 ${hm(d.mod)}` : d.wait <= 0 ? '곧 도착' : d.wait < 60 ? `${d.wait}분` : `${Math.floor(d.wait / 60)}시간 ${d.wait % 60}분`;

/** 카드: 선택 승강장의 다음 두 대와 운행 시간 */
export function cardText(route, stop, [d1, d2]) {
  const w = waitText(d1);
  return {
    w1: d1 ? (d1.tomorrow ? '내일' : w === '곧 도착' ? '곧 도착' : `${w} 후`) : '—',
    at1: d1 ? `${hm(d1.mod)} 도착 예정` : '',
    w2: d2 ? (d2.tomorrow ? `내일 ${hm(d2.mod)}` : `${waitText(d2)} 후`) : '',
    at2: d2 ? (d2.tomorrow ? '그다음 차' : `${hm(d2.mod)} 그다음 차`) : '',
    mark: d1 && d1.mark && stop.mark ? `※ 이번 차는 ${stop.mark}` : '',
    span: route.hours === '24시간' ? '24시간 운행 · 심야엔 배차가 길어요' : `첫차 ${hm(stop.deps[0].m)} · 막차 ${hm(stop.deps[stop.deps.length - 1].m)}`
  };
}

/** 정차 순서 끝 줄 */
export const tailText = route => route.loop ? `↻ ${route.stops[0].label}(으)로 돌아와 순환 · ${route.duration}` : route.after ? `… ${route.after}` : route.duration;
