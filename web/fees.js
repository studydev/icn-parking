'use strict';

(() => {
  const Fees = ParkingFees;
  const element = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const won = value => value.toLocaleString('ko-KR') + '원';
  const range = (low, high) => low === high ? won(low) : `${won(low)} ~ ${won(high)}`;
  const numeric = id => element(id) && element(id).value !== '' ? Number(element(id).value) : null;
  const value = (id, fallback) => element(id)?.value || fallback;
  const triOptions = [['unknown', '모름 / 확인 필요'], ['yes', '이 조건 확인됨'], ['no', '충족하지 않음']];
  const select = (id, label, options = triOptions) => `<label>${label}<select id="${id}">${options.map(([code, text]) => `<option value="${code}">${esc(text)}</option>`).join('')}</select></label>`;
  const number = (id, label) => `<label>${label}<input id="${id}" type="number" min="0" step="1" placeholder="모름은 비워 두기"></label>`;
  const form = element('fee-form');
  let hasResult = false;
  const invalidate = () => {
    element('fee-error').hidden = true;
    element('fee-example-note').hidden = true;
    if (hasResult) element('fee-results').innerHTML = '<p class="fee-help" role="status">입력이 바뀌었습니다. 계산하기를 눌러 결과를 갱신해 주세요.</p>';
  };

  element('fee-qualifications').innerHTML = Object.entries(Fees.qualifications).map(([code, rule]) => `
    <div class="fee-qualification">
      <label><input type="checkbox" id="q-${code}" data-qualification="${code}"> ${esc(rule.name)} · ${rule.rate}%</label>
      <label class="fee-state-label">등록·적용 상태<select id="q-${code}-state" disabled><option value="unknown">등록 상태 모름</option><option value="confirmed">자격·사전등록/행정정보 확인 완료</option><option value="pending">자격 충족·사후 신청 예정</option></select></label>
    </div>`).join('');

  for (const prefix of ['a', 'b']) element(`fee-card-${prefix}`).innerHTML = '<option value="none">카드혜택 없음 / 선택 안 함</option>' + Fees.cards.map(card => `<option value="${card.id}">${esc(card.name)}${card.productCode ? ' / ' + card.productCode : ''}</option>`).join('');
  function renderCard(prefix) {
    const id = value(`fee-card-${prefix}`, 'none'), product = Fees.cards.find(card => card.id === id);
    const box = element(`fee-card-${prefix}-fields`), key = name => `c-${prefix}-${name}`;
    if (!product) { box.innerHTML = ''; return; }
    if (product.type === 'excluded') { box.innerHTML = '<p class="notice">케이엠파크 대상 상품으로 ICN 공식 주차요금에 자동 적용하지 않습니다.</p>'; return; }
    const threshold = product.type === 'classic' ? '50만원 / 상위 200만원' : product.type === 'oil' ? '30만원 / 상위 70만원' : '30만원';
    box.innerHTML = `
      <p class="fee-help"><a href="${esc(product.source)}" target="_blank" rel="noopener">${esc(product.name)} ${product.type === 'sfc' ? '비공식 조사 후보 출처' : '공식 상품 안내'}</a> · ${Fees.checkedAt} 확인${product.issuance ? ' · ' + esc(product.issuance) : ''}</p>
      <div class="fee-fields">
        ${number(key('approval'), '이 카드의 실제 승인액(비우면 정산액 전액)')}
        ${select(key('policy'), '해당 정산일의 상품 혜택 유효성')}
        ${select(key('holder'), '카드 명의', [['unknown', '모름'], ['self', '본인카드'], ['family', '가족카드']])}
        ${select(key('parallel'), '공항 감면과 카드 혜택 병행')}
        ${select(key('installment'), '할부 방식', [['unknown', '모름'], ['single', '일시불'], ['normal', '일반 유이자 할부'], ['interest-free', '무이자할부'], ['slim', '슬림/특수할부']])}
        ${select(key('scope'), '이 장소·결제채널의 대상 가맹점 확인')}
        ${select(key('split'), '현금·포인트·분할 승인 거래 인정')}
        ${select(key('excluded'), '상품 제외 거래 해당 여부', [['unknown', '모름'], ['no', '포인트 사용분·다른 프로모션 등 제외 조건 없음'], ['yes', '제외 거래에 해당']])}
        ${product.type !== 'sfc' ? number(key('spend'), `카드사가 인정한 전월 실적(원) · ${threshold}`) + select(key('spend-state'), '실적 금액을 모를 때', [['unknown', '실적도 모름'], ['below', '기준 미충족'], ['low', '하위 기준 충족'], ['high', '상위 기준 충족(삼성은 30만원 기준)']]) : number(key('previous-year'), '전년도 카드사 인정 실적(원)')}
        ${product.type !== 'sfc' ? select(key('new'), '최초 신규 예외 기간·자격', [['no', '예외 아님(갱신/재발급 포함)'], ['unknown', '모름'], ['yes', '발급/등록월+다음달의 최초 신규 예외 확인']]) : ''}
        <label>${product.type === 'samsung' || product.type === 'sfc' ? '최초 발급월' : '최초 사용등록월'}(선택)<input id="${key('month')}" type="month"></label>
        ${['samsung', 'classic'].includes(product.type) ? number(key('month-used'), '이번 달 주차혜택 사용횟수') + number(key('year-used'), '연간 주차혜택 사용횟수') : ''}
        ${product.type === 'classic' ? number(key('discount-used'), '이번 달 해당 할인액 사용분(원)') : ''}
        ${product.type === 'samsung' ? number(key('competing'), '다른 삼성 청구할인 예상액(없으면 0)') : ''}
        ${product.type === 'oil' ? select(key('merchant'), 'ICN 거래가 신한 주차장 업종인지') + number(key('eligible-used'), '이번 달 정비+주차 할인대상 이용액 사용분(원)') + select(key('other-issuer'), '다른 신한 할인 적용 거래', [['unknown', '모름'], ['no', '아님'], ['yes', '해당']]) : ''}
        ${product.type === 'sfc' ? number(key('day-used'), '오늘 후보 혜택 사용횟수') + number(key('year-used'), '올해 후보 혜택 사용횟수') : ''}
      </div>
      <p class="fee-help">실적은 카드 총사용액이 아니라 카드사가 인정한 금액입니다. Deep Oil은 주유·LPG와 제외 항목을 빼고 본인·가족 이용을 합산합니다. 미확인 조건은 할인 미적용/조건 충족 시 결과로 나눕니다.</p>`;
  }
  function readCard(prefix) {
    const id = value(`fee-card-${prefix}`, 'none'), product = Fees.cards.find(card => card.id === id), key = name => `c-${prefix}-${name}`;
    return {
      id, approvalAmount: numeric(key('approval')),
      conditions: {
        policyValid: value(key('policy'), 'unknown'), holder: value(key('holder'), 'unknown'),
        airportParallel: value(key('parallel'), 'unknown'), installment: value(key('installment'), 'unknown'),
        scopeConfirmed: value(key('scope'), 'unknown'), splitCoverage: value(key('split'), 'unknown'),
        excludedTransaction: value(key('excluded'), 'unknown'), recognizedSpend: numeric(key('spend')),
        spendState: value(key('spend-state'), 'unknown'), newException: value(key('new'), 'no'),
        issuedMonth: ['samsung', 'sfc'].includes(product?.type) ? value(key('month')) : undefined,
        registeredMonth: ['classic', 'oil'].includes(product?.type) ? value(key('month')) : undefined,
        monthUsed: numeric(key('month-used')), yearUsed: numeric(key('year-used')),
        monthlyDiscountUsed: numeric(key('discount-used')), competingDiscount: numeric(key('competing')),
        merchantParking: value(key('merchant'), 'unknown'), eligibleSpendUsed: numeric(key('eligible-used')),
        otherIssuerBenefit: value(key('other-issuer'), 'unknown'), previousYearSpend: numeric(key('previous-year')),
        dayUsed: numeric(key('day-used'))
      }
    };
  }
  function qualifications() {
    return Object.keys(Fees.qualifications).filter(code => element(`q-${code}`).checked).map(code => ({ code, state: value(`q-${code}-state`, 'unknown') }));
  }
  function updateContext() {
    const cargo = value('fee-location') === 'cargo';
    const terminal = element('fee-terminal');
    if (cargo) terminal.value = 'cargo';
    else if (terminal.value === 'cargo') terminal.value = 'T1';
    terminal.disabled = cargo;
    for (const id of ['fee-entry', 'fee-exit']) {
      const date = new Date(value(id) + ':00+09:00');
      element(id + '-day').textContent = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'long' }).format(date) : '한국시간 · 날짜 입력 확인 필요';
    }
    element('fee-place-note').hidden = value('fee-location') !== 'reservation';
    element('fee-place-note').textContent = '예약 예정 이용기간은 1일 이상 30일 미만이며 45일 전~4시간 전 예약 조건을 별도 확인합니다. 보증금·취소/노쇼 비용과 충돌하는 높이 기준은 주차요금 계산과 별개입니다.';
    element('fee-quantity-label').hidden = value('fee-vehicle') === 'passenger';
    element('fee-quantity').step = value('fee-vehicle') === 'bus' ? '1' : '0.01';
    element('fee-quantity-label').firstChild.textContent = value('fee-vehicle') === 'bus' ? '버스 정원(명)' : '최대적재량(톤)';
    for (const code of Object.keys(Fees.qualifications)) element(`q-${code}-state`).disabled = !element(`q-${code}`).checked;
    element('fee-refund-fields').hidden = !qualifications().some(item => item.state === 'pending');
  }
  function renderResults(result) {
    const box = element('fee-results');
    if (!result.base.supported) {
      box.innerHTML = `<div class="notice"><b>추가 확인 · 이 선택에는 요금을 확정하지 않습니다.</b><ul>${result.base.warnings.map(warning => `<li>${esc(warning)}</li>`).join('')}</ul></div>`;
      return;
    }
    const reference = result.base.scenarios[0].label;
    const primary = result.scenarios.filter(scenario => scenario.feeAssumption === reference);
    const rows = primary.length ? primary : result.scenarios;
    const duration = `${result.base.days || 0}일 ${Math.floor((result.base.minutes % 1440) / 60)}시간 ${result.base.minutes % 60}분`;
    box.innerHTML = `<h2 class="ops-heading">계산 결과 · ${esc(duration)}</h2><p class="fee-help">${esc(result.base.status)} · 요금상 ${result.base.size === 'small' ? '소형' : '대형'} · ${esc(reference)}</p>
      ${rows.map((row, index) => `<article class="fee-result" data-card="${esc(row.card.product?.id || 'none')}">
        <h3>${esc(row.card.product?.name || '카드 혜택 미선택')}</h3><p class="fee-help">${esc(row.airport.label)} · 카드 판정: <b>${esc(row.card.status)}</b></p>
        <dl class="fee-steps">
          <div><dt>감면 전 기본 주차요금</dt><dd>${won(row.baseFee)}</dd></div>
          <div><dt>공항 감면액 · ${row.airport.rate}% 하나 적용</dt><dd>−${won(row.airport.discount)}</dd></div>
          <div><dt>공항 감면 후 주차요금</dt><dd>${won(row.airport.payment)}</dd></div>
          <div class="fee-settlement"><dt>출차·정산 시 결제액</dt><dd>${won(row.airport.payment)}</dd></div>
          <div><dt>해당 카드 승인액</dt><dd>${won(row.approvalAmount)}</dd></div>
          <div><dt>카드 청구할인 예상</dt><dd>${range(row.card.minDiscount, row.card.maxDiscount)}</dd></div>
          <div class="fee-final"><dt>청구할인 후 부담 예상</dt><dd>${range(row.minBurden, row.maxBurden)}</dd></div>
        </dl>
        ${row.airport.basis.length ? `<p class="fee-help">현장 적용 근거: ${row.airport.basis.map(esc).join(' · ')}${row.airport.otherQualifications.length ? ' · 나머지 자격은 합산하지 않습니다.' : ''}</p>` : ''}
        ${row.postRefund ? `<div class="notice"><b>사후 ${row.airport.targetRate}% 승인 시 추가 환불 ${won(row.postRefund.refundIfApproved)}</b><p>출차 후 30일 기준: ${esc(row.refundDeadline.replace('T', ' '))} KST까지 신청 여부를 확인하세요(토·일·공휴일 포함).</p><p>환불·혜택 조정 후 부담 예상: ${range(row.postRefund.minBurden, row.postRefund.maxBurden)}. 카드 혜택 환수 가능액: 최대 ${won(row.postRefund.possibleClawback)}.</p><p>${esc(row.postRefund.note)}</p></div>` : ''}
        <details class="fee-details"><summary>판정 근거·확인할 조건</summary><ul>${row.card.reasons.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul>${row.card.product ? `<a href="${esc(row.card.product.source)}" target="_blank" rel="noopener">${row.card.product.type === 'sfc' ? '비공식 후보 자료' : '정확한 상품의 공식 안내'}</a>` : ''}</details>
      </article>`).join('')}
      <details class="fee-details"><summary>요금 경계의 다른 가정과 출처</summary><div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>미확인 시간 정책 가정</th><th>감면 전 금액</th></tr></thead><tbody>${result.base.scenarios.map(scenario => `<tr><td>${esc(scenario.label)}</td><td>${won(scenario.amount)}</td></tr>`).join('')}</tbody></table></div><ul>${[...result.base.warnings, ...(result.warnings || [])].map(warning => `<li>${esc(warning)}</li>`).join('')}</ul><p>다른 가정에서도 공항 감면·카드 최소금액을 다시 판정해야 합니다. 위 결과는 선택한 기준 가정이며 실제 정산액 보장이 아닙니다.</p></details>`;
  }
  function calculate() {
    element('fee-error').hidden = true;
    const chosen = ['a', 'b'].map(readCard).filter(card => card.id !== 'none');
    const request = {
      location: value('fee-location'), terminal: value('fee-terminal'), entry: value('fee-entry'), exit: value('fee-exit'),
      vehicle: { kind: value('fee-vehicle'), quantity: numeric('fee-quantity'), height: numeric('fee-height') },
      qualifications: qualifications(), commercial: value('fee-commercial'), cards: chosen,
      method: value('fee-method'), refundMethod: value('fee-refund-method'), benefitRetention: value('fee-retention')
    };
    try {
      renderResults(Fees.calculate(request));
      hasResult = true;
    } catch (error) {
      console.error('Parking fee calculation failed:', error);
      element('fee-results').innerHTML = '';
      element('fee-error').textContent = error instanceof Fees.InputError ? error.message : '계산 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
      element('fee-error').hidden = false;
      if (!(error instanceof Fees.InputError)) throw error;
    }
  }
  form.addEventListener('submit', event => { event.preventDefault(); calculate(); });
  form.addEventListener('input', invalidate);
  form.addEventListener('change', event => {
    if (event.target.id === 'fee-card-a') renderCard('a');
    if (event.target.id === 'fee-card-b') renderCard('b');
    updateContext();
    invalidate();
  });
  element('fee-example').addEventListener('click', () => {
    element('fee-location').value = 'long';
    element('fee-entry').value = '2026-10-02T07:40';
    element('fee-exit').value = '2026-10-08T16:33';
    element('fee-vehicle').value = 'passenger';
    element('fee-height').value = '';
    element('fee-commercial').value = 'private';
    element('fee-method').value = 'offline';
    for (const code of Object.keys(Fees.qualifications)) element(`q-${code}`).checked = code === 'eco12';
    element('q-eco12-state').value = 'confirmed';
    element('fee-card-a').value = 'AAP1442'; element('fee-card-b').value = 'none';
    renderCard('a'); renderCard('b');
    for (const name of ['policy', 'parallel', 'scope', 'split']) element(`c-a-${name}`).value = 'yes';
    element('c-a-holder').value = 'self'; element('c-a-installment').value = 'single';
    element('c-a-excluded').value = 'no'; element('c-a-spend').value = '300000';
    element('c-a-month-used').value = '0'; element('c-a-year-used').value = '0'; element('c-a-competing').value = '0';
    element('fee-example-note').hidden = false;
    updateContext(); calculate();
  });
  const start = new Date(Date.now() + 9 * 3600000);
  element('fee-entry').value = start.toISOString().slice(0, 16);
  element('fee-exit').value = new Date(start.getTime() + 864e5).toISOString().slice(0, 16);
  element('fee-tariffs').innerHTML = `<table class="ops-table"><caption>공식 확인 요금표 · ${Fees.checkedAt} 확인, 시행일 미확인</caption><thead><tr><th>주차장·규모</th><th>최초 무료</th><th>요금</th><th>일 최대</th></tr></thead><tbody>${Object.values(Fees.tariffs).flatMap(tariff => {
    const rows = [{ size: '소형', unit: tariff.unitFee, cap: tariff.cap }];
    if (tariff.largeCap) rows.push({ size: '대형', unit: tariff.largeUnitFee, cap: tariff.largeCap });
    return rows.map(row => `<tr><th>${tariff.name} ${row.size}</th><td>${tariff.free}분</td><td>${tariff.initialFee ? `기본 ${tariff.initialMinutes}분 ${won(tariff.initialFee)} / ` : ''}${tariff.unitMinutes === 60 ? '시간당' : `추가 ${tariff.unitMinutes}분`} ${won(row.unit)}</td><td>${won(row.cap)}</td></tr>`);
  }).join('')}</tbody></table>`;
  updateContext();
  calculate();
})();
