import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  money,
  toCents,
  amountInput,
  localDateTime,
  southAfricanISO,
} from '../../apps/marketplace-web/src/lib.js';
test('marketplace amounts preserve cents without floating point arithmetic', () => {
  for (const [input, cents, display] of [
    ['0', 0, 'R 0'],
    ['1240', 124000, 'R 1 240'],
    ['1240.50', 124050, 'R 1 240.50'],
    ['1010.01', 101001, 'R 1 010.01'],
  ]) {
    assert.equal(toCents(input), cents);
    assert.equal(money(cents), display);
    assert.equal(toCents(amountInput(cents)), cents);
  }
  for (const input of ['1.001', '-1', 'NaN', '1e5', '9007199254740992'])
    assert.throws(() => toCents(input));
});
test('scheduled service times round trip in South African time regardless of server timezone', () => {
  assert.equal(localDateTime('2026-11-01T22:30:00.000Z'), '2026-11-02T00:30');
  assert.equal(southAfricanISO('2026-11-02T00:30'), '2026-11-01T22:30:00.000Z');
  assert.throws(() => southAfricanISO('not a date'));
});
