'use strict';

const ParkingFees = (() => {
  const checkedAt = '2026-10-11';
  const sources = {
    tariff: 'https://www.airport.kr/ap_ko/969/subview.do',
    english: 'https://www.airport.kr/ap_en/1497/subview.do',
    calculator: 'https://www.airport.kr/parkingPrice/ap_ko/parkingPricePopup.do',
    reservation: 'https://parking.airport.kr/reserve/6320_01',
    refund: 'https://parking.airport.kr/wp/6110_01',
    eco: 'https://ev.or.kr/nportal/buySupprt/initMycarNonpolluCheckAction.do',
    classic: 'https://www.shinhancard.com/pconts/html/card/apply/premium/1237950_2205.html',
    oil: 'https://www.shinhancard.com/pconts/html/card/apply/credit/1188274_2207.html',
    sfc: 'https://card-lounge.toss.im/card/11125?filters=travel'
  };
  const samsungUrl = code => `https://www.samsungcard.com/home/card/cardinfo/PGHPPCCCardCardinfoDetails001?code=${code}`;
  const tariffs = {
    short: { name: '단기', free: 10, initialMinutes: 30, initialFee: 1200, unitMinutes: 15, unitFee: 600, cap: 24000 },
    long: { name: '장기', free: 10, unitMinutes: 60, unitFee: 1000, cap: 9000 },
    reservation: { name: '예약', free: 10, unitMinutes: 60, unitFee: 1000, cap: 9000 },
    cargo: { name: '화물터미널', free: 45, unitMinutes: 15, unitFee: 500, cap: 10000, largeUnitFee: 600, largeCap: 12000 }
  };
  const qualifications = {
    compact: { name: '법정 경차', rate: 50 },
    disability: { name: '장애인·등록 단체 차량', rate: 50 },
    veteran: { name: '등급·등록 확인 유공자', rate: 50 },
    children: { name: '다자녀(2자녀 이상·막내 만18세 이하·한국 국적)', rate: 50 },
    eco12: { name: '등록 저공해 1·2종', rate: 50 },
    eco3: { name: '등록 저공해 3종', rate: 20 },
    electric: { name: '전기차(저공해 등록 확인 필요)', rate: 50 }
  };
  const cards = [
    { id: 'AAP1442', name: '삼성 THE 1 BIZ', type: 'samsung', family: false, issuance: '신규 중단·갱신/재발급 안내', source: samsungUrl('AAP1442') },
    { id: 'AAP1414', name: '삼성 THE 1', type: 'samsung', family: true, issuance: '신규 중단 안내', source: samsungUrl('AAP1414') },
    { id: 'AAP1450', name: '삼성 THE 1 (스카이패스)', type: 'samsung', family: false, issuance: '발급 상태 별도 확인', source: samsungUrl('AAP1450') },
    { id: 'AAP1497', name: '삼성 THE 1 BIZ (SC제일은행)', type: 'samsung', family: null, issuance: '발급·가족카드 조건 별도 확인', source: samsungUrl('AAP1497') },
    { id: 'AAP1499', name: '삼성 THE 1 스카이패스 (SC제일은행)', type: 'samsung', family: null, issuance: '발급·가족카드 조건 별도 확인', source: samsungUrl('AAP1499') },
    { id: 'classic-air', name: '신한 The CLASSIC AIR', type: 'classic', family: null, source: sources.classic },
    { id: 'deep-oil', name: '신한 Deep Oil · ICN 업종 조건부', type: 'oil', family: true, source: sources.oil },
    { id: 'sfc-esmile', name: 'SFC 삼성에스마일플래티늄 · 공식 재확인 후보', type: 'sfc', family: false, source: sources.sfc },
    { id: 'AAP1825', name: '삼성 iD PLUG-IN · ICN 자동 적용 제외', type: 'excluded', source: samsungUrl('AAP1825') },
    { id: 'AAP1766', name: '삼성 iD AUTO · ICN 자동 적용 제외', type: 'excluded', source: samsungUrl('AAP1766') }
  ].map(card => ({ ...card, productCode: card.id.startsWith('AAP') ? card.id : null, checkedAt, effectiveFrom: null }));
  class InputError extends Error {}
  function choice(value, allowed, label, fallback) {
    const selected = value === undefined ? fallback : value;
    if (!allowed.includes(selected)) throw new InputError(`${label} 선택을 확인해 주세요.`);
    return selected;
  }
  function money(value, label, fallback = null) {
    if (value === undefined || value === null || value === '') return fallback;
    if (!Number.isSafeInteger(value) || value < 0) throw new InputError(`${label}은 0 이상의 정수여야 합니다.`);
    return value;
  }
  const tri = (value, label, fallback = 'unknown') => choice(value, ['yes', 'no', 'unknown'], label, fallback);
  function parseKst(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new InputError('입출차 시각을 연·월·일·시·분으로 입력해 주세요.');
    const timestamp = Date.parse(value + ':00+09:00');
    if (!Number.isFinite(timestamp) || new Date(timestamp + 9 * 3600000).toISOString().slice(0, 16) !== value) throw new InputError('실제로 존재하는 한국시간 날짜와 시각을 입력해 주세요.');
    return timestamp;
  }
  function monthIndex(value) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value || '')) throw new InputError('카드 발급·사용등록 월을 YYYY-MM 형식으로 확인해 주세요.');
    return Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
  }
  function vehicleClass(vehicle = {}) {
    const kind = choice(vehicle.kind, ['passenger', 'bus', 'truck'], '차종', 'passenger');
    if (kind === 'passenger') return 'small';
    const quantity = vehicle.quantity;
    if (!Number.isFinite(quantity) || quantity <= 0 || (kind === 'bus' && !Number.isInteger(quantity))) throw new InputError(kind === 'bus' ? '버스 승차 정원을 입력해 주세요.' : '화물차 최대적재량(톤)을 입력해 주세요.');
    return quantity <= (kind === 'bus' ? 15 : 1) ? 'small' : 'large';
  }
  function baseFees({ location = 'long', vehicle = {}, entry, exit }) {
    const place = choice(location, Object.keys(tariffs), '주차장', 'long');
    const start = parseKst(entry), end = parseKst(exit);
    if (end < start) throw new InputError('출차 시각은 입차 시각 이후여야 합니다.');
    const minutes = (end - start) / 60000, size = vehicleClass(vehicle), tariff = tariffs[place];
    const warnings = ['2026-10-11 확인 요금표이며 정책 시행일은 미확인입니다. 결제 시 최신 정책을 확인하세요.'];
    if (entry.slice(0, 10) < checkedAt) warnings.push('과거 이용기간에 현재 요금표를 적용한 재현 가정입니다. 당시 정책 적용 여부는 미확인입니다.');
    let unsupported = '';
    if (place === 'short' && (vehicle.kind && vehicle.kind !== 'passenger')) unsupported = '단기주차장은 승용차 전용입니다.';
    if (place === 'long' && size === 'large') unsupported = '장기 대형 요금은 현재 공식 표에서 확인되지 않습니다. 이용 불가로 단정하지 않으며 운영자 요금 확인이 필요합니다.';
    if (place === 'reservation' && size === 'large') unsupported = '예약 FAQ는 대형 차량 이용을 제한합니다. 현재 대형 요금을 적용하지 않습니다.';
    if (vehicle.height !== undefined && vehicle.height !== null) {
      if (!Number.isFinite(vehicle.height) || vehicle.height <= 0) throw new InputError('차량 높이는 양수(m)로 입력해 주세요.');
      if (place === 'short' && vehicle.height > 2.1) unsupported = '단기주차장 제한높이는 2.1m 이하입니다.';
      if (place === 'reservation' && vehicle.height >= 2.8) unsupported = '예약 높이 안내가 요금표 2.8m·FAQ 3.8m로 충돌합니다. 예약 관리팀 확인 후 이용하세요.';
    }
    if (place === 'reservation') {
      warnings.push('예약보증금 10,000원·취소/노쇼 비용·발레파킹료는 이 주차요금에 합산하지 않습니다.');
      if (minutes < 1440 || minutes >= 30 * 1440) warnings.push('예약 예정 이용기간은 1일 이상 30일 미만이어야 합니다. 계산은 실제 이용시간 가정이며 예약 가능 여부와 별개입니다.');
    }
    if (unsupported) return { location: place, size, minutes, status: '추가 확인', scenarios: [], warnings: [...warnings, unsupported], supported: false };
    const cap = size === 'large' ? tariff.largeCap : tariff.cap;
    const unit = size === 'large' ? tariff.largeUnitFee : tariff.unitFee;
    const days = Math.floor(minutes / 1440), remainder = minutes % 1440;
    const firstCharge = time => place === 'short'
      ? Math.min(tariff.initialFee + Math.ceil(Math.max(time - tariff.initialMinutes, 0) / tariff.unitMinutes) * unit, cap)
      : place === 'cargo' ? Math.min(Math.ceil(Math.max(time - tariff.free, 0) / tariff.unitMinutes) * unit, cap)
        : Math.min(Math.ceil(time / tariff.unitMinutes) * unit, cap);
    const amount = (time, { subtract = false, repeatFree = false, repeatBase = false, proportional = false, inclusive = true } = {}) => {
      if (proportional && time > 0 && place === 'short') {
        const d = Math.floor(time / 1440), r = time % 1440;
        return d ? d * cap + Math.min(r * unit / tariff.unitMinutes, cap) : Math.min(time < tariff.initialMinutes ? tariff.initialFee : time * unit / tariff.unitMinutes, cap);
      }
      if (time === 0 || (inclusive ? time <= tariff.free : time < tariff.free)) return 0;
      if (time === tariff.free && !inclusive) return place === 'short' ? tariff.initialFee : unit;
      const charged = subtract ? Math.max(0, time - tariff.free) : time;
      const d = Math.floor(time / 1440), r = time % 1440;
      if (!d) {
        if (place === 'cargo' && subtract) return Math.min(Math.ceil(charged / tariff.unitMinutes) * unit, cap);
        return firstCharge(charged);
      }
      if (!r || (repeatFree && r <= tariff.free)) return d * cap;
      const residual = place === 'short' ? (repeatBase ? firstCharge(r) : Math.ceil(r / tariff.unitMinutes) * unit)
        : place === 'cargo' ? Math.ceil(Math.max(r - (repeatFree ? tariff.free : 0), 0) / tariff.unitMinutes) * unit : Math.ceil(r / tariff.unitMinutes) * unit;
      return d * cap + Math.min(residual, cap);
    };
    const scenarios = [{ label: place === 'long' || place === 'reservation' ? '시간 올림·입차 기준 24시간, 무료 초과 시 입차부터 계산 가정' : '단위 올림·입차 기준 24시간 가정', amount: amount(minutes) }];
    if (minutes > 0) {
      if (place !== 'cargo') scenarios.push({ label: '최초 무료 10분 차감 가정', amount: amount(minutes, { subtract: true }) });
      scenarios.push({ label: '잔여 일자 무료시간 재적용 가정', amount: amount(minutes, { repeatFree: true }) });
      if (minutes === tariff.free) scenarios.push({ label: '정확한 무료 경계 제외 가정', amount: amount(minutes, { inclusive: false }) });
      if (place === 'short') {
        scenarios.push({ label: '후속 24시간에 기본 30분 재부과 가정', amount: amount(minutes, { repeatBase: true }) });
        scenarios.push({ label: '공개 구형 함수의 분 비례 요금(무료 안내와 불일치)', amount: amount(minutes, { proportional: true }) });
      }
    }
    if (minutes > 0) warnings.push(place === 'long' || place === 'reservation'
      ? '시간 올림·24시간 분할은 공개식과 검증했습니다. 정확한 무료 경계·무료분 차감·후속 일자 재적용은 미확인입니다.'
      : '단위 올림·무료 경계·후속 일자 과금은 미확인입니다. 다른 가정의 금액도 확인하고 실제 정산액과 구분하세요.');
    return { location: place, size, minutes, days, remainder, cap, supported: true, status: minutes === 0 ? '계산 검증' : '조건부 예상', formulaStatus: place === 'long' ? '계산 검증(무료 정책 제외)' : '추가 확인', scenarios, warnings };
  }
  function airportScenarios(base, selected = [], commercial = 'private') {
    if (!Array.isArray(selected)) throw new InputError('감면 자격 선택을 확인해 주세요.');
    const use = choice(commercial, ['private', 'business', 'proof', 'unknown'], '영업용 차량 상태', 'private');
    const seen = new Set();
    const rows = selected.map(item => {
      if (!qualifications[item.code] || seen.has(item.code)) throw new InputError('중복되거나 알 수 없는 감면 자격입니다.');
      seen.add(item.code);
      return { ...qualifications[item.code], code: item.code, state: choice(item.state, ['confirmed', 'pending', 'unknown'], '자격 등록 상태', 'unknown') };
    });
    const maxRate = items => Math.max(0, ...items.map(item => item.rate));
    const outcomes = [];
    const approvalOptions = rows.some(row => row.state === 'unknown') ? [false, true] : [false];
    const proofOptions = use === 'unknown' ? [false, true] : [use !== 'business'];
    for (const proof of proofOptions) for (const approved of approvalOptions) {
      const eligible = proof ? rows : [];
      const onsite = eligible.filter(row => row.state === 'confirmed' || (approved && row.state === 'unknown'));
      const rate = maxRate(onsite), targetRate = Math.max(rate, maxRate(eligible.filter(row => row.state === 'pending')));
      const discount = base * rate / 100, refund = base * (targetRate - rate) / 100;
      if (!Number.isSafeInteger(discount) || !Number.isSafeInteger(refund)) throw new InputError('원 미만 감면액 처리 규칙은 확인이 필요합니다.');
      const confirmedBasis = onsite.filter(row => row.rate === rate && row.state === 'confirmed');
      const basis = confirmedBasis.length ? confirmedBasis : onsite.filter(row => row.rate === rate);
      outcomes.push({
        label: !proof ? '영업 목적·개인 목적 증빙 미확인: 감면 없음' : approved ? '미확인 등록도 승인된 경우' : rows.some(row => row.state === 'unknown') ? '미확인 등록 미적용' : '확인된 현장 자격 기준',
        rate, discount, payment: base - discount, targetRate, refund,
        basis: basis.map(row => row.name), otherQualifications: rows.filter(row => !basis.some(item => item.code === row.code)).map(row => row.name),
        conditional: approved || use === 'unknown' || targetRate > rate
      });
    }
    return outcomes;
  }
  function cardBenefit(id, approvalAmount, context = {}, conditions = {}) {
    const amount = money(approvalAmount, '카드 승인금액');
    if (amount === null) throw new InputError('카드 승인금액을 확인해 주세요.');
    if (id === 'none') return { status: '미선택', minDiscount: 0, maxDiscount: 0, reasons: ['카드 혜택을 선택하지 않았습니다.'] };
    const product = cards.find(card => card.id === id);
    if (!product) throw new InputError('정확한 카드 상품을 선택해 주세요.');
    const reasons = [], blocked = [], needs = [];
    const check = (value, label) => { if (value === 'no') blocked.push(label); else if (value === 'unknown') needs.push(label); };
    const method = choice(context.method, ['offline', 'online', 'mobile', 'qr', 'easy', 'hipass', 'unknown'], '결제 방식', 'unknown');
    const installment = choice(conditions.installment, ['single', 'normal', 'interest-free', 'slim', 'unknown'], '할부', 'unknown');
    const holder = choice(conditions.holder, ['self', 'family', 'unknown'], '카드 명의', 'unknown');
    const place = choice(context.location, Object.keys(tariffs), '주차장', 'long');
    if (product.type === 'excluded') return { product, status: '추가 확인', minDiscount: 0, maxDiscount: 0, reasons: ['케이엠파크만 명시된 상품입니다. ICN 공식 주차요금에 자동 적용하지 않습니다.'] };
    if (!amount) return { product, status: '불가', minDiscount: 0, maxDiscount: 0, reasons: ['이 카드로 승인될 금액이 0원입니다.'] };
    const paymentMonth = context.paymentDate?.slice(0, 7);
    if (!paymentMonth) throw new InputError('카드 정산 일자를 확인해 주세요.');
    const paymentIndex = monthIndex(paymentMonth);
    check(tri(conditions.policyValid, '해당 결제일 혜택 확인'), '해당 결제일의 상품 혜택 유효성');
    if (holder === 'family' && product.family === false) blocked.push('해당 상품은 가족카드 이용이 제한됩니다.');
    else if (holder === 'unknown' || (holder === 'family' && product.family === null)) needs.push('본인/가족카드 제공 범위');
    if (context.airportRate > 0) check(tri(conditions.airportParallel, '공항 감면 병행'), '공항 감면과 카드 혜택 병행 적용');
    if (context.mixedPayment) check(tri(conditions.splitCoverage, '분할 결제 인정'), '현금·포인트·분할 카드 거래의 인정 범위');
    const newState = tri(conditions.newException, '신규 예외', 'no');
    if (conditions.issuedMonth) monthIndex(conditions.issuedMonth);
    if (conditions.registeredMonth) monthIndex(conditions.registeredMonth);
    const startMonth = product.type === 'samsung' ? conditions.issuedMonth : conditions.registeredMonth;
    let newException = newState === 'yes', exceptionPossible = newState === 'unknown', newGap = null;
    if (startMonth) {
      const gap = paymentIndex - monthIndex(startMonth);
      newGap = gap;
      if (gap < 0) blocked.push('발급·사용등록 이전의 결제입니다.');
      if (gap < 0 || gap > 1) { newException = false; exceptionPossible = false; }
    }
    if (exceptionPossible && product.type !== 'sfc') needs.push('신규 예외 기간·최초 신규회원 자격');
    const spend = money(conditions.recognizedSpend, '카드사 인정 실적');
    const spendState = choice(conditions.spendState, ['low', 'high', 'below', 'unknown'], '인정 실적 구간', 'unknown');
    let threshold = product.type === 'classic' ? 500000 : product.type === 'sfc' ? 10000000 : 300000;
    let high = product.type === 'classic' ? 2000000 : product.type === 'oil' ? 700000 : threshold;
    let recognized = spend !== null ? spend : spendState === 'low' ? threshold : spendState === 'high' ? high : spendState === 'below' ? 0 : null;
    if (product.type === 'sfc') {
      recognized = money(conditions.previousYearSpend, '전년도 인정 실적');
      newException = false;
      if (!conditions.issuedMonth) needs.push('발급 다음 해 이후 여부');
      else if (Number(paymentMonth.slice(0, 4)) <= Number(conditions.issuedMonth.slice(0, 4))) blocked.push('SFC 후보는 발급 다음 해부터 제공되는 조건입니다.');
      needs.push('SFC 현행 상품설명서·최소결제액·기타 조건의 공식 재확인');
    }
    if (recognized === null && !newException) needs.push('카드사가 인정한 실적');
    if (recognized !== null && recognized < threshold && !newException && (!exceptionPossible || product.type === 'sfc')) blocked.push('인정 실적이 기준 미만이며 신규 예외가 없습니다.');
    if (newException) reasons.push('발급/사용등록월과 다음달의 신규 예외를 입력 조건으로 반영했습니다. 갱신·재발급은 최초 신규 예외가 아닙니다.');
    const monthUsed = money(conditions.monthUsed, '월 사용횟수');
    const yearUsed = money(conditions.yearUsed, '연 사용횟수');
    if (product.type === 'samsung' || product.type === 'classic') {
      if (monthUsed === null || yearUsed === null) needs.push('월·연 혜택 사용횟수(취소/집계 기준은 카드사 확인)');
      if (monthUsed >= 1 || yearUsed >= 4) blocked.push('월 1회 또는 연 4회 제공횟수가 소진되었습니다.');
    }
    let discount = 0;
    if (product.type === 'samsung') {
      if (amount < 30000) blocked.push('해당 카드 승인액이 30,000원 미만입니다.');
      if (installment === 'interest-free') blocked.push('무이자할부는 삼성 주차 할인 제외입니다.');
      if (installment === 'unknown') needs.push('무이자할부 여부');
      if (installment === 'slim') needs.push('해당 특수 할부의 적용 여부');
      const scope = tri(conditions.scopeConfirmed, '삼성 장소·채널 인정 범위');
      if (['reservation', 'cargo'].includes(place) || method !== 'offline') check(scope, '예약/화물·결제채널의 삼성 혜택 인정 범위');
      if (method === 'offline' && !['reservation', 'cargo'].includes(place) && scope === 'no') blocked.push('이 거래의 카드 혜택 대상 가맹점이 아닙니다.');
      const competing = money(conditions.competingDiscount, '다른 삼성 청구할인액', 0);
      if (conditions.competingDiscount === null) needs.push('다른 삼성 청구할인과의 큰 혜택 하나 적용(없으면 0 입력)');
      if (competing > amount) throw new InputError('다른 삼성 청구할인액은 승인액을 초과할 수 없습니다.');
      discount = Math.max(10000, competing);
      if (competing) reasons.push('다른 삼성 청구할인과 합산하지 않고 큰 금액 하나만 비교합니다.');
    } else if (product.type === 'classic') {
      if (!['short', 'long'].includes(place)) blocked.push('The CLASSIC AIR는 공식 T1/T2 단기·장기만 명시합니다.');
      if (['online', 'mobile', 'easy'].includes(method)) blocked.push('온라인·앱·간편결제는 The CLASSIC AIR 할인 제외입니다.');
      if (['qr', 'hipass', 'unknown'].includes(method)) check(tri(conditions.scopeConfirmed, '오프라인 가맹점 확인'), '오프라인 승인 가맹점·채널 확인');
      const cap = newException ? 10000 : recognized === null ? 20000 : recognized >= high ? 20000 : 10000;
      const used = money(conditions.monthlyDiscountUsed, '월 할인액 사용분', monthUsed === 0 ? 0 : null);
      if (used === null) needs.push('잔여 월 할인액 한도');
      if (used !== null && used >= cap) blocked.push('이번 달 카드 주차 할인액 한도가 소진되었습니다.');
      discount = Math.min(amount * 0.2, Math.max(0, cap - (used ?? 0)));
      reasons.push(`월 할인액 한도 ${cap.toLocaleString('ko-KR')}원, 온라인·간편결제·주차대행 제외입니다.`);
    } else if (product.type === 'oil') {
      check(tri(conditions.merchantParking, '신한 주차장 업종'), 'ICN 승인 가맹점의 신한 주차장 업종 등록');
      check(tri(conditions.otherIssuerBenefit, '다른 신한 할인', 'no') === 'yes' ? 'no' : conditions.otherIssuerBenefit === 'unknown' ? 'unknown' : 'yes', '다른 신한 할인 적용 거래 제외');
      if (['interest-free', 'slim'].includes(installment)) blocked.push('무이자·슬림할부는 Deep Oil 할인 제외입니다.');
      if (installment === 'unknown') needs.push('무이자·슬림할부 여부');
      let cap = newException ? (newGap === 1 && recognized >= high ? 300000 : 150000) : recognized === null ? 300000 : recognized >= high ? 300000 : 150000;
      if (newException && newGap === null && recognized >= high) {
        cap = 300000;
        needs.push('신규 사용등록월인지 익월의 상위 실적 적용인지');
      }
      const used = money(conditions.eligibleSpendUsed, '월 정비·주차 할인대상 이용액');
      if (used === null) needs.push('본인+가족 정비·주차 공유 대상 이용한도 사용분');
      if (used !== null && used >= cap) blocked.push('정비·주차 공유 할인대상 이용액 한도가 소진되었습니다.');
      discount = Math.min(amount, Math.max(0, cap - (used ?? 0))) * 0.1;
      reasons.push(`월 ${cap.toLocaleString('ko-KR')}원은 할인액이 아니라 정비·주차 합산 할인대상 이용액 한도입니다. 주유·LPG를 뺀 인정 실적을 사용합니다.`);
    } else if (product.type === 'sfc') {
      const annual = recognized === null ? 3 : recognized < 10000000 ? 0 : recognized < 20000000 ? 1 : recognized < 30000000 ? 2 : 3;
      const daily = money(conditions.dayUsed, '일 사용횟수');
      if (daily === null || yearUsed === null) needs.push('SFC 후보의 일·연 잔여횟수');
      if (daily >= 1 || yearUsed >= annual) blocked.push('SFC 후보의 일·연 제공횟수가 소진되었습니다.');
      discount = Math.min(12000, amount);
      reasons.push('12,000원은 비공식 2차 자료의 후보 혜택입니다. 확정 할인으로 등록하지 않습니다.');
    }
    const excluded = tri(conditions.excludedTransaction, '제외 거래', 'no');
    if (excluded === 'yes') blocked.push('해당 상품의 제외 거래 조건에 해당합니다.');
    if (excluded === 'unknown') needs.push('포인트·취소·다른 프로모션 등 상품별 제외 거래');
    if (blocked.length) return { product, status: '불가', minDiscount: 0, maxDiscount: 0, reasons: [...blocked, ...needs, ...reasons] };
    discount = Math.min(discount, amount);
    const fractional = !Number.isInteger(discount);
    if (fractional) reasons.push('원 미만 청구할인 처리 방식 미확인: 절사·올림 시나리오입니다.');
    return {
      product, status: needs.length || fractional ? '조건부 예상' : '입력 조건 충족',
      minDiscount: needs.length ? 0 : Math.floor(discount), maxDiscount: Math.ceil(discount),
      reasons: [...needs.map(reason => reason + ' 확인 필요'), ...reasons],
      evidence: product.type === 'sfc' ? '추가 확인' : '공식 확인(개별 거래는 입력 조건 전제)'
    };
  }
  function calculate(input) {
    const base = baseFees(input);
    choice(input.terminal, base.location === 'cargo' ? ['cargo'] : ['T1', 'T2'], '터미널', base.location === 'cargo' ? 'cargo' : 'T1');
    if (!base.supported) return { base, scenarios: [] };
    if (input.cards !== undefined && !Array.isArray(input.cards)) throw new InputError('카드 비교 목록을 확인해 주세요.');
    if (input.qualifications !== undefined && !Array.isArray(input.qualifications)) throw new InputError('공항 감면 목록을 확인해 주세요.');
    const selections = input.qualifications || [], commercial = input.commercial || 'private';
    const cardInputs = input.cards?.length ? input.cards : [{ id: 'none', conditions: {} }];
    if (!Array.isArray(cardInputs) || new Set(cardInputs.map(card => card.id)).size !== cardInputs.length) throw new InputError('카드 비교 선택을 확인해 주세요. 같은 상품은 중복 선택할 수 없습니다.');
    const scenarios = [], warnings = [];
    for (const fee of base.scenarios) for (const airport of airportScenarios(fee.amount, selections, commercial)) for (const card of cardInputs) {
      const explicitAmount = money(card.approvalAmount, '실제 해당 카드 승인액');
      const approval = explicitAmount === null ? airport.payment : explicitAmount;
      if (approval > airport.payment) {
        warnings.push(`${fee.label} · ${airport.label}: 입력 카드 승인액이 이 가정의 정산액을 초과하여 이 비교는 제외했습니다.`);
        continue;
      }
      const context = { location: base.location, paymentDate: input.exit, method: input.method, airportRate: airport.rate, mixedPayment: explicitAmount !== null && explicitAmount < airport.payment };
      const benefit = cardBenefit(card.id, approval, context, card.conditions);
      const method = choice(input.refundMethod, ['bank', 'card', 'unknown'], '환불 방식', 'unknown');
      const retained = tri(input.benefitRetention, '환불 후 카드 혜택 유지');
      let postRefund = null;
      if (airport.refund) {
        const remaining = Math.max(0, approval - airport.refund);
        const revised = method === 'card' ? cardBenefit(card.id, remaining, context, card.conditions) : benefit;
        const max = retained === 'no' ? 0 : method === 'card' ? revised.maxDiscount : benefit.maxDiscount;
        const min = retained === 'yes' && method === 'bank' ? benefit.minDiscount : 0;
        postRefund = {
          refundIfApproved: airport.refund, method, revisedCardApproval: method === 'card' ? remaining : null,
          minBurden: airport.payment - airport.refund - max, maxBurden: airport.payment - airport.refund - min,
          possibleClawback: benefit.maxDiscount - min,
          note: '사후승인·환불 방식·부분취소와 카드 할인 유지/환수를 별도 확인해야 합니다. 원 승인액을 미래 환불액으로 소급해 바꾸지 않습니다.'
        };
      }
      scenarios.push({
        feeAssumption: fee.label, baseFee: fee.amount, airport, approvalAmount: approval, card: benefit,
        minBurden: airport.payment - benefit.maxDiscount, maxBurden: airport.payment - benefit.minDiscount,
        postRefund, refundDeadline: airport.refund ? new Date(parseKst(input.exit) + 30 * 864e5 + 9 * 3600000).toISOString().slice(0, 16) : null
      });
    }
    if (!scenarios.length) throw new InputError('카드 승인액은 가능한 정산 결제액을 초과할 수 없습니다.');
    return { base, scenarios, warnings: [...new Set(warnings)], checkedAt, effectiveFrom: null };
  }
  return Object.freeze({ checkedAt, effectiveFrom: null, sources, tariffs, qualifications, cards, InputError, parseKst, vehicleClass, baseFees, airportScenarios, cardBenefit, calculate });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ParkingFees;
