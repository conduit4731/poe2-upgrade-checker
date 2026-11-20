'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { appZoom } = require('../src/core/appzoom');

test('auto: 1x up to 1500 px wide, then grows with the window', () => {
  assert.strictEqual(appZoom('auto', 1240), 1);
  assert.strictEqual(appZoom('auto', 1500), 1);
  assert.strictEqual(appZoom('auto', 1920), 1.28);
  assert.strictEqual(appZoom(undefined, 1920), 1.28);
});

test('auto: capped for very wide windows', () => {
  assert.strictEqual(appZoom('auto', 2560), 1.45);
  assert.strictEqual(appZoom('auto', 3840), 1.45);
});

test('a fixed size wins over the window width', () => {
  assert.strictEqual(appZoom('1.15', 2560), 1.15);
  assert.strictEqual(appZoom(1.3, 900), 1.3);
});

test('nonsense falls back to auto', () => {
  assert.strictEqual(appZoom('huge', 1200), 1);
  assert.strictEqual(appZoom(7, 1200), 1);
  assert.strictEqual(appZoom('auto', 0), 1);
});
