const { test } = require('node:test');
const assert = require('node:assert/strict');
const Fees = require('../web/parking-fees.js');
const dates = minutes => ({
  entry: '2026-10-11T10:00',
  exit: new Date(Date.parse('2026-10-11T10:00:00Z') + minutes * 60000).toISOString().slice(0, 16)
});
const confirmed = {
  recognizedSpend: 300000, monthUsed: 0, yearUsed: 0, installment: 'single', holder: 'self',
  policyValid: 'yes', airportParallel: 'yes', scopeConfirmed: 'yes', newException: 'no',
  merchantParking: 'yes', otherIssuerBenefit: 'no', eligibleSpendUsed: 0, excludedTransaction: 'no'
};
const context = { paymentDate: '2026-10-11T10:00', method: 'offline', location: 'long', airportRate: 50 };
const quote = (id, amount, conditions = {}, extra = {}) => Fees.cardBenefit(id, amount, { ...context, ...extra }, { ...confirmed, ...conditions });
const basic = (location, minutes, vehicle) => Fees.baseFees({ location, ...dates(minutes), vehicle });

test('KST parsing is strict and independent of browser timezone, including invalid and reversed dates', () => {
  assert.equal(Fees.parseKst('2026-10-11T10:00'), Date.parse('2026-10-11T01:00:00Z'));
  for (const date of ['2026-02-30T12:00', '2026-13-01T00:00', '2026-10-11T24:01', '2026-10-11', 'not-date']) assert.throws(() => Fees.parseKst(date), Fees.InputError);
  assert.throws(() => Fees.baseFees({ entry: '2026-10-12T10:00', exit: '2026-10-11T10:00' }), /출차/);
  assert.equal(Fees.baseFees({ location: 'long', entry: '2026-10-11T23:50', exit: '2026-10-12T00:20' }).scenarios[0].amount, 1000);
  assert.equal(basic('long', 0).scenarios[0].amount, 0);
  assert.deepEqual(Fees.duration('2026-10-02T07:40', '2026-10-08T16:33'), { minutes: 9173, days: 6, hours: 8, remainingMinutes: 53 });
  assert.throws(() => Fees.duration('2026-10-12T10:00', '2026-10-11T10:00'), Fees.InputError);
});

test('long-term small uses 24-hour blocks and remainder hours, not ceiling days', () => {
  for (const [minutes, expected] of [[1440, 9000], [1560, 11000], [6 * 1440 + 533, 63000], [61, 2000], [540, 9000], [1439, 9000], [1441, 10000]]) {
    assert.equal(basic('long', minutes).scenarios[0].amount, expected);
  }
  assert.equal(basic('reservation', 1560).scenarios[0].amount, 11000);
  assert.equal(basic('reservation', 1441).scenarios.find(s => s.label.startsWith('최초 무료')).amount, 10000, 'subtracting initial grace must not move the entry-based 24-hour boundary');
  assert.equal(Fees.effectiveFrom, null);
  assert.match(Fees.baseFees({ location: 'long', entry: '2026-10-02T07:40', exit: '2026-10-08T16:33' }).warnings.join(' '), /당시 정책/);
});

test('uncertain free, short and cargo boundaries stay explicit scenarios rather than exact settlement claims', () => {
  assert.equal(basic('long', 9).scenarios[0].amount, 0);
  assert.deepEqual([...new Set(basic('long', 10).scenarios.map(s => s.amount))].sort((a, b) => a - b), [0, 1000]);
  assert.equal(basic('long', 11).scenarios[0].amount, 1000);
  for (const [minutes, expected] of [[30, 1200], [31, 1800], [45, 1800], [46, 2400]]) assert.equal(basic('short', minutes).scenarios[0].amount, expected);
  assert(basic('short', 31).scenarios.some(s => s.amount === 1240));
  assert(basic('short', 1441).scenarios.some(s => s.amount === 24040));
  assert.equal(basic('short', 1441).status, '조건부 예상');
  assert.equal(basic('cargo', 44).scenarios[0].amount, 0);
  assert(basic('cargo', 45).scenarios.some(s => s.amount === 500));
  assert.equal(basic('cargo', 46).scenarios[0].amount, 500);
  assert.equal(basic('cargo', 46, { kind: 'truck', quantity: 2 }).scenarios[0].amount, 600);
  assert.equal(basic('cargo', 1441).scenarios[0].amount, 10500);
  assert(basic('cargo', 1441).scenarios.some(s => s.amount === 10000));
});

test('vehicle fee size is separate from compact-car remission and unsupported large tariffs are not invented', () => {
  assert.equal(Fees.vehicleClass({ kind: 'passenger' }), 'small');
  assert.equal(Fees.vehicleClass({ kind: 'bus', quantity: 15 }), 'small');
  assert.equal(Fees.vehicleClass({ kind: 'bus', quantity: 16 }), 'large');
  assert.equal(Fees.vehicleClass({ kind: 'truck', quantity: 1 }), 'small');
  assert.equal(Fees.vehicleClass({ kind: 'truck', quantity: 1.01 }), 'large');
  assert.throws(() => Fees.vehicleClass({ kind: 'bus', quantity: 2.5 }), Fees.InputError);
  assert.equal(basic('long', 1440, { kind: 'bus', quantity: 16 }).supported, false);
  assert.match(basic('long', 1440, { kind: 'bus', quantity: 16 }).warnings.join(' '), /이용 불가로 단정하지/);
  assert.equal(basic('reservation', 1440, { kind: 'bus', quantity: 16 }).scenarios.length, 0);
  assert.equal(basic('short', 60, { kind: 'truck', quantity: 1 }).supported, false);
  assert.equal(basic('short', 60, { kind: 'passenger', height: 2.2 }).supported, false);
});

test('airport qualifications select the maximum once and prefer registered qualifications for equal rates', () => {
  const outcomes = Fees.airportScenarios(10000, [{ code: 'eco3', state: 'confirmed' }, { code: 'children', state: 'confirmed' }, { code: 'compact', state: 'unknown' }]);
  assert(outcomes.every(row => row.rate === 50 && row.discount === 5000 && row.payment === 5000));
  assert(outcomes[0].basis[0].includes('다자녀'));
  assert.equal(Fees.airportScenarios(10000, [{ code: 'compact', state: 'confirmed' }, { code: 'eco12', state: 'confirmed' }])[0].discount, 5000);
  assert.equal(Fees.airportScenarios(10000, [{ code: 'compact', state: 'confirmed' }], 'business')[0].discount, 0);
  assert.equal(Fees.airportScenarios(10000, [{ code: 'electric', state: 'unknown' }]).length, 2);
  assert.throws(() => Fees.airportScenarios(10000, [{ code: 'eco3', state: 'confirmed' }, { code: 'eco3', state: 'pending' }]), Fees.InputError);
});

test('post-remission uses the original fee difference, not a percentage of the discounted payment', () => {
  const result = Fees.airportScenarios(10000, [{ code: 'eco3', state: 'confirmed' }, { code: 'children', state: 'pending' }])[0];
  assert.equal(result.payment, 8000);
  assert.equal(result.refund, 3000);
  assert.equal(result.targetRate, 50);
  assert.equal(Fees.airportScenarios(10000, [{ code: 'children', state: 'unknown' }])[0].payment, 10000);
});

test('all five Samsung products use their own identity, actual approval threshold, spend and usage conditions', () => {
  for (const id of ['AAP1442', 'AAP1414', 'AAP1450', 'AAP1497', 'AAP1499']) {
    assert.equal(quote(id, 29999).maxDiscount, 0);
    assert.equal(quote(id, 30000).minDiscount, 10000);
    assert.equal(quote(id, 31500).maxDiscount, 10000);
    assert.equal(quote(id, 31500, { recognizedSpend: 299999 }).maxDiscount, 0);
    assert.equal(quote(id, 31500, { monthUsed: 1 }).maxDiscount, 0);
    assert.equal(quote(id, 31500, { yearUsed: 4 }).maxDiscount, 0);
    assert.equal(quote(id, 31500, { installment: 'interest-free' }).maxDiscount, 0);
    assert.equal(quote(id, 31500, { airportParallel: 'unknown' }).minDiscount, 0);
    assert.equal(quote(id, 31500, { airportParallel: 'unknown' }).status, '조건부 예상');
  }
  assert.throws(() => quote('made-up-samsung', 31500), Fees.InputError);
  assert.equal(quote('AAP1442', 31500, { holder: 'family' }).maxDiscount, 0);
  assert.equal(quote('AAP1442', 31500, { competingDiscount: 15000 }).maxDiscount, 15000);
});

test('new-member exceptions expire after the following calendar month and do not extend to renewals', () => {
  assert.equal(quote('AAP1442', 31500, { recognizedSpend: 0, newException: 'yes', issuedMonth: '2026-09' }).maxDiscount, 10000);
  assert.equal(quote('AAP1442', 31500, { recognizedSpend: 0, newException: 'yes', issuedMonth: '2026-08' }).maxDiscount, 0);
  assert.equal(quote('classic-air', 31500, { recognizedSpend: 0, newException: 'yes', registeredMonth: '2026-09' }).maxDiscount, 6300);
  assert.equal(quote('classic-air', 31500, { recognizedSpend: 0, newException: 'no', registeredMonth: '2026-09' }).maxDiscount, 0);
  assert.equal(quote('AAP1442', 31500, { issuedMonth: '2026-11' }).maxDiscount, 0);
  const possible = quote('AAP1442', 31500, { recognizedSpend: 0, newException: 'unknown' });
  assert.equal(possible.status, '조건부 예상');
  assert.equal(possible.maxDiscount, 10000);
  assert.equal(quote('AAP1442', 31500, { recognizedSpend: 0, newException: 'unknown', issuedMonth: '2026-08' }).maxDiscount, 0);
});

test('The CLASSIC AIR checks location, offline payment, exact spend tiers and remaining monthly discount', () => {
  assert.equal(quote('classic-air', 31500, { recognizedSpend: 500000 }).maxDiscount, 6300);
  assert.equal(quote('classic-air', 100000, { recognizedSpend: 1999999 }).maxDiscount, 10000);
  assert.equal(quote('classic-air', 100000, { recognizedSpend: 2000000 }).maxDiscount, 20000);
  assert.equal(quote('classic-air', 31500, { recognizedSpend: 500000, monthlyDiscountUsed: 9000 }).maxDiscount, 1000);
  for (const method of ['online', 'mobile', 'easy']) assert.equal(quote('classic-air', 31500, { recognizedSpend: 500000 }, { method }).maxDiscount, 0);
  for (const location of ['reservation', 'cargo']) assert.equal(quote('classic-air', 31500, { recognizedSpend: 500000 }, { location }).maxDiscount, 0);
});

test('Deep Oil caps eligible spending, shares the used amount and never assumes ICN merchant classification', () => {
  assert.equal(quote('deep-oil', 31500, { recognizedSpend: 400000, eligibleSpendUsed: 140000 }).maxDiscount, 1000);
  assert.equal(quote('deep-oil', 31500, { recognizedSpend: 700000, eligibleSpendUsed: 290000 }).maxDiscount, 1000);
  assert.equal(quote('deep-oil', 31500, { merchantParking: 'unknown' }).minDiscount, 0);
  assert.equal(quote('deep-oil', 31500, { merchantParking: 'unknown' }).maxDiscount, 3150);
  assert.equal(quote('deep-oil', 31500, { otherIssuerBenefit: 'yes' }).maxDiscount, 0);
  assert.equal(quote('deep-oil', 31500, { installment: 'slim' }).maxDiscount, 0);
  assert.equal(quote('deep-oil', 200000, { recognizedSpend: 0, newException: 'yes' }).maxDiscount, 15000);
  assert.equal(quote('deep-oil', 200000, { recognizedSpend: 700000, newException: 'yes', registeredMonth: '2026-10' }).maxDiscount, 15000);
  assert.equal(quote('deep-oil', 200000, { recognizedSpend: 700000, newException: 'yes', registeredMonth: '2026-09' }).maxDiscount, 20000);
});

test('unverified SFC and restricted KM Park products never masquerade as confirmed ICN discounts', () => {
  const sfc = extra => quote('sfc-esmile', 31500, { previousYearSpend: 10000000, issuedMonth: '2025-01', dayUsed: 0, ...extra });
  assert.equal(sfc({}).status, '조건부 예상');
  assert.equal(sfc({}).minDiscount, 0);
  assert.equal(sfc({}).maxDiscount, 12000);
  assert.equal(sfc({ issuedMonth: '2026-01' }).maxDiscount, 0);
  assert.equal(sfc({ previousYearSpend: 9999999 }).maxDiscount, 0);
  assert.equal(sfc({ yearUsed: 1 }).maxDiscount, 0);
  assert.equal(sfc({ previousYearSpend: 20000000, yearUsed: 1 }).maxDiscount, 12000);
  assert.equal(sfc({ previousYearSpend: 30000000, yearUsed: 2 }).maxDiscount, 12000);
  for (const id of ['AAP1825', 'AAP1766']) assert.equal(quote(id, 31500).maxDiscount, 0);
});

test('the supplied 2026 example reproduces settlement and card bill savings without stacking cards', () => {
  const result = Fees.calculate({
    location: 'long', entry: '2026-10-02T07:40', exit: '2026-10-08T16:33',
    qualifications: [{ code: 'eco12', state: 'confirmed' }], method: 'offline',
    cards: [{ id: 'AAP1442', conditions: confirmed }, { id: 'classic-air', conditions: { ...confirmed, recognizedSpend: 500000 } }]
  });
  const samsung = result.scenarios[0], classic = result.scenarios[1];
  assert.equal(samsung.baseFee, 63000);
  assert.equal(samsung.airport.discount, 31500);
  assert.equal(samsung.airport.payment, 31500);
  assert.equal(samsung.approvalAmount, 31500);
  assert.equal(samsung.card.maxDiscount, 10000);
  assert.equal(samsung.minBurden, 21500);
  assert.equal(classic.minBurden, 25200);
  assert(result.scenarios.every(s => s.card.maxDiscount <= s.approvalAmount));
});

test('airport discounts cross the Samsung minimum on settlement, not on the undiscounted fee', () => {
  for (const [hours, fee, approval, discount, burden] of [[5, 59000, 29500, 0, 29500], [6, 60000, 30000, 10000, 20000], [9, 63000, 31500, 10000, 21500]]) {
    const result = Fees.calculate({ location: 'long', ...dates(6 * 1440 + hours * 60), qualifications: [{ code: 'eco12', state: 'confirmed' }], method: 'offline', cards: [{ id: 'AAP1442', conditions: confirmed }] }).scenarios[0];
    assert.equal(result.baseFee, fee);
    assert.equal(result.approvalAmount, approval);
    assert.equal(result.card.maxDiscount, discount);
    assert.equal(result.minBurden, burden);
  }
});

test('after-refund cases preserve settlement, reassess card cancellation and disclose unknown retention', () => {
  const input = { location: 'long', ...dates(4 * 1440), qualifications: [{ code: 'eco3', state: 'confirmed' }, { code: 'children', state: 'pending' }], method: 'offline', cards: [{ id: 'AAP1442', conditions: confirmed }] };
  const base = Fees.calculate(input).scenarios[0];
  assert.equal(base.airport.payment, 28800);
  assert.equal(base.airport.refund, 10800);
  assert.equal(base.card.maxDiscount, 0);
  assert.equal(base.refundDeadline, '2026-11-14T10:00');
  const larger = { ...input, ...dates(5 * 1440) };
  const unknown = Fees.calculate(larger).scenarios[0];
  assert.equal(unknown.approvalAmount, 36000);
  assert.equal(unknown.postRefund.minBurden, 12500);
  assert.equal(unknown.postRefund.maxBurden, 22500);
  const cancelled = Fees.calculate({ ...larger, refundMethod: 'card' }).scenarios[0];
  assert.equal(cancelled.postRefund.revisedCardApproval, 22500);
  assert.equal(cancelled.postRefund.minBurden, 22500);
  assert.equal(cancelled.postRefund.maxBurden, 22500);
});

test('invalid money and conflicting actual approvals fail explicitly; unknown conditions keep scenarios', () => {
  assert.throws(() => quote('AAP1442', -1), Fees.InputError);
  assert.throws(() => quote('AAP1442', 30000, { recognizedSpend: 1.2 }), Fees.InputError);
  assert.throws(() => Fees.calculate({ ...dates(60), location: 'long', cards: [{ id: 'AAP1442', approvalAmount: 5000, conditions: confirmed }] }), /승인액/);
  const unknown = quote('AAP1442', 31500, { recognizedSpend: null, spendState: 'unknown', monthUsed: null, yearUsed: null });
  assert.equal(unknown.status, '조건부 예상');
  assert.equal(unknown.minDiscount, 0);
  assert.equal(unknown.maxDiscount, 10000);
  const fractional = quote('deep-oil', 29999);
  assert.equal(fractional.minDiscount, 2999);
  assert.equal(fractional.maxDiscount, 3000);
  assert.equal(fractional.status, '조건부 예상');
  assert.throws(() => Fees.calculate({ ...dates(60), cards: 'not-an-array' }), Fees.InputError);
});
