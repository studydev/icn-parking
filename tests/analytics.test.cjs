const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '../web/analytics.js'), 'utf8');

function runtime(measurementId = 'G-EXAMPLE123', existing = []) {
  const context = vm.createContext({
    window: { dataLayer: existing }, URL, Date,
    location: { href: 'https://parking.example.org/fees.html?terminal=T2&private=not-for-analytics#example' },
    document: {
      currentScript: { dataset: { measurementId } },
      referrer: 'https://parking.example.org/?private=not-for-analytics#week/T2'
    }
  });
  vm.runInContext(code, context);
  return context;
}

test('GA4 queues the standard initialization and requested measurement ID without inline scripts', () => {
  const context = runtime();
  const commands = context.window.dataLayer.map(command => [...command]);
  assert.equal(typeof context.window.gtag, 'function');
  assert.equal(commands.length, 2);
  assert.equal(commands[0][0], 'js');
  assert(commands[0][1] instanceof Date);
  assert.equal(commands[1][0], 'config');
  assert.equal(commands[1][1], 'G-EXAMPLE123');
  assert.equal(commands[1][2].allow_google_signals, false);
  assert.equal(commands[1][2].allow_ad_personalization_signals, false);
});

test('analytics preserves an existing data layer and does not include query, fragment or fee inputs in configured page metadata', () => {
  const existing = [{ event: 'existing-event' }], context = runtime('G-EXAMPLE123', existing);
  assert.equal(context.window.dataLayer, existing);
  assert.equal(existing[0].event, 'existing-event');
  const settings = existing[2][2];
  assert.equal(settings.page_location, 'https://parking.example.org/fees.html');
  assert.equal(settings.page_referrer, 'https://parking.example.org/');
  assert.doesNotMatch(JSON.stringify(settings), /private|terminal|example#|entry|exit|qualification|card/);
  assert.doesNotMatch(code, /querySelector|addEventListener|localStorage|fee-form/);
});

test('an invalid or absent measurement ID fails explicitly instead of initializing a wrong property', () => {
  for (const id of ['', 'UA-12345-1', 'GTM-ABCDE', 'G-example123', '"><script>']) {
    assert.throws(() => runtime(id), /valid measurement ID/);
  }
});
