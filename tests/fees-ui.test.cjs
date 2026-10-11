const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const web = path.join(__dirname, '../web');

test('time review and confirmation sit with the input fields, not in the sticky navigation header', () => {
  const html = fs.readFileSync(path.join(web, 'fees.html'), 'utf8');
  const header = /<header\b[^>]*>([\s\S]*?)<\/header>/.exec(html)[1];
  const firstFieldset = /<fieldset\b[^>]*>([\s\S]*?)<\/fieldset>/.exec(html)[1];
  assert.doesNotMatch(header, /fee-time-review|fee-confirm-times|fee-time-status/);
  assert.match(firstFieldset, /id="fee-time-review"/);
  assert.match(firstFieldset, /id="fee-confirm-times"/);
  assert(firstFieldset.indexOf('id="fee-confirm-times"') > firstFieldset.indexOf('id="fee-exit"'));
});

function runtime(mobile = true, terminal = '') {
  const elements = new Map(), errors = [], classes = new Set();
  function register(html) {
    const ids = [];
    for (const match of html.matchAll(/<([a-z][a-z0-9-]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi)) {
      const [, tag, id] = match;
      const node = {
        id, value: '', checked: false, disabled: /\bdisabled\b/.test(match[0]), hidden: /\bhidden\b/.test(match[0]),
        open: /\bopen\b/.test(match[0]), dataset: {}, firstChild: { textContent: '' }, textContent: '',
        listeners: {}, childIds: [],
        addEventListener(name, callback) { this.listeners[name] = callback; }
      };
      if (tag === 'select') {
        const content = html.slice(match.index + match[0].length).split('</select>')[0];
        const options = [...content.matchAll(/<option value="([^"]+)"([^>]*)>/g)];
        node.value = (options.find(option => /\bselected\b/.test(option[2])) || options[0])?.[1] || '';
      }
      Object.defineProperty(node, 'innerHTML', {
        get() { return this.html || ''; },
        set(value) {
          for (const child of this.childIds) elements.delete(child);
          this.html = value;
          this.childIds = register(value);
          if (tag === 'select') this.value = /<option value="([^"]+)"/.exec(value)?.[1] || '';
        }
      });
      elements.set(id, node);
      ids.push(id);
    }
    return ids;
  }
  register(fs.readFileSync(path.join(web, 'fees.html'), 'utf8'));
  const context = vm.createContext({
    Date, Intl, URLSearchParams, location: { search: terminal ? '?terminal=' + terminal : '' },
    window: { matchMedia: () => ({ matches: mobile }), addEventListener: () => {} },
    document: {
      body: { classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name) } },
      getElementById: id => elements.get(id) || null, querySelectorAll: () => []
    },
    console: { error: (...args) => errors.push(args) }
  });
  for (const file of ['occupancy.js', 'parking-fees.js', 'fees.js']) vm.runInContext(fs.readFileSync(path.join(web, file), 'utf8'), context);
  const get = id => elements.get(id);
  const change = (id, value, eventName = 'change') => {
    if (typeof value === 'boolean') get(id).checked = value; else get(id).value = value;
    get('fee-form').listeners[eventName]({ target: get(id) });
  };
  const click = id => get(id).listeners.click();
  const submit = () => get('fee-form').listeners.submit({ preventDefault() {} });
  return { get, change, click, submit, errors, classes };
}

test('fee inputs require an explicit time confirmation and display the reviewed KST period', () => {
  const { get, click, submit, errors, classes } = runtime();
  assert.equal(get('fee-submit').disabled, true);
  assert.equal(get('fee-results').innerHTML, '');
  assert.match(get('fee-time-review').innerHTML, /입차|출차|이용시간/);
  assert.match(get('fee-time-review').innerHTML, /KST/);
  assert(classes.has('layout-mobile'));
  assert.equal(get('fee-information').open, false);
  submit();
  assert.equal(get('fee-error').hidden, false);
  assert.match(get('fee-error').textContent, /먼저 확인/);
  assert.equal(errors.length, 1);
  click('fee-confirm-times');
  assert.equal(get('fee-submit').disabled, false);
  assert.equal(get('fee-time-review').dataset.confirmed, 'true');
  assert.match(get('fee-time-status').textContent, /확인 완료/);
  submit();
  assert.match(get('fee-results').innerHTML, /fee-confirmed-period/);
  assert.match(get('fee-results').innerHTML, /9,000원/);
  assert.doesNotMatch(get('fee-results').innerHTML, /fee-breakdown" open/);
});

test('the fee page follows the incoming terminal and rejects an invalid terminal explicitly', () => {
  assert.equal(runtime(true, 'T2').get('fee-terminal').value, 'T2');
  assert.equal(runtime(true, 'T1').get('fee-terminal').value, 'T1');
  const invalid = runtime(true, 'T3');
  assert.equal(invalid.get('fee-error').hidden, false);
  assert.match(invalid.get('fee-error').textContent, /터미널/);
  assert.equal(invalid.errors.length, 1);
});

test('changing either time invalidates prior confirmation and stale results, while other input changes do not', () => {
  const { get, change, click, submit } = runtime();
  change('fee-entry', '2026-10-11T10:00');
  change('fee-exit', '2026-10-12T12:00');
  click('fee-confirm-times');
  submit();
  assert.match(get('fee-time-review').innerHTML, /1일 2시간 0분/);
  assert.match(get('fee-results').innerHTML, /11,000원/);
  change('fee-location', 'short');
  assert.equal(get('fee-submit').disabled, false);
  change('fee-exit', '2026-10-12T13:00', 'input');
  assert.equal(get('fee-submit').disabled, true);
  assert.equal(get('fee-time-review').dataset.confirmed, 'false');
  assert.match(get('fee-results').innerHTML, /입력이 바뀌었습니다/);
  assert.doesNotMatch(get('fee-results').innerHTML, /fee-result"/);
  change('fee-entry', '2026-10-13T10:00');
  click('fee-confirm-times');
  assert.equal(get('fee-submit').disabled, true);
  assert.equal(get('fee-error').hidden, false);
  assert.match(get('fee-error').textContent, /출차/);
});

test('quick remission selection preserves unknown/confirmed/deferred registration without stacking qualifications', () => {
  const { get, change, click, submit } = runtime();
  change('fee-entry', '2026-10-11T10:00');
  change('fee-exit', '2026-10-12T10:00');
  change('fee-quick-discount', 'children');
  assert.equal(get('q-children').checked, true);
  assert.equal(get('q-children-state').value, 'unknown');
  click('fee-confirm-times');
  submit();
  assert.match(get('fee-results').innerHTML, /미확인 등록 미적용/);
  assert.match(get('fee-results').innerHTML, /미확인 등록도 승인된 경우/);
  change('fee-quick-state', 'confirmed');
  submit();
  assert.match(get('fee-results').innerHTML, /4,500원/);
  assert.doesNotMatch(get('fee-results').innerHTML, /미확인 등록 미적용/);
  change('fee-quick-discount', 'eco3');
  assert.equal(get('q-children').checked, false);
  assert.equal(get('q-eco3').checked, true);
  assert.equal(get('q-eco3-state').value, 'unknown', 'a different qualification must not inherit the previous registration confirmation');
  change('fee-quick-state', 'confirmed');
  change('q-children', true);
  change('q-children-state', 'pending');
  assert.equal(get('fee-quick-discount').value, 'custom');
  submit();
  assert.match(get('fee-results').innerHTML, /7,200원/);
  assert.match(get('fee-results').innerHTML, /추가 환불 2,700원/);
});

test('one card selection leaves detailed conditions collapsed and uncertainty intact', () => {
  const { get, change, click, submit } = runtime();
  change('fee-entry', '2026-10-02T07:40');
  change('fee-exit', '2026-10-08T16:33');
  change('fee-card-a', 'AAP1442');
  assert.equal(get('c-a-details').open, false);
  assert.equal(get('c-a-policy').value, 'unknown');
  assert.equal(get('c-a-spend').value, '');
  click('fee-confirm-times');
  submit();
  assert.match(get('fee-results').innerHTML, /조건부 예상/);
  assert.match(get('fee-results').innerHTML, /53,000원 ~ 63,000원/);
  change('fee-quick-discount', 'custom');
  assert.equal(get('fee-advanced-options').open, true);
  assert.equal(get('fee-qualifications-panel').open, true);
});

test('the sample shows its confirmed times and expected amounts without changing tariff or benefit rules', () => {
  const { get, click } = runtime(false);
  click('fee-example');
  assert.equal(get('fee-time-review').dataset.confirmed, 'true');
  assert.equal(get('fee-example-note').hidden, false);
  assert.match(get('fee-time-review').innerHTML, /2026-10-02 .*07:40 KST/);
  assert.match(get('fee-time-review').innerHTML, /2026-10-08 .*16:33 KST/);
  assert.match(get('fee-results').innerHTML, /63,000원/);
  assert.match(get('fee-results').innerHTML, /31,500원/);
  assert.match(get('fee-results').innerHTML, /21,500원/);
  assert.match(get('fee-results').innerHTML, /fee-breakdown" open/);
  assert.equal(get('fee-information').open, true);
  assert.match(get('occupancy-scale').innerHTML, /공통|만차 도달/);
});
