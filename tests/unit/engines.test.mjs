import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quote } from '../../packages/pricing-engine/src/engine.mjs';
import { rank } from '../../packages/matching-engine/src/engine.mjs';
test('integer pricing, surcharge cap, discount and VAT', () =>
  assert.deepEqual(
    quote({
      labour: 10000,
      surchargeBps: 9000,
      maxSurchargeBps: 5000,
      discount: 1000,
      taxBps: 1500,
      version: 'v1',
    }),
    {
      subtotal: 14000,
      tax: 2100,
      total: 16100,
      surcharge: 5000,
      currency: 'ZAR',
      version: 'v1',
    },
  ));
test('rounds half minor unit upwards', () =>
  assert.equal(quote({ labour: 1, taxBps: 5000, version: 'v1' }).tax, 1));
test('rejects invalid money and overflow', () => {
  for (const labour of [-1, 0.1, NaN, Infinity])
    assert.throws(() => quote({ labour, version: 'v1' }));
  assert.throws(() =>
    quote({ labour: Number.MAX_SAFE_INTEGER, callout: 1, version: 'v1' }),
  );
  assert.throws(() => quote({ labour: 1, discount: 2, version: 'v1' }));
});
const provider = {
  id: 'p',
  verification: 'APPROVED',
  available: true,
  suspended: false,
  categories: ['plumbing'],
  distanceKm: 2,
  radiusKm: 10,
  capacity: 1,
  features: { skills: 1, credentials: 1 },
};
test('excludes suspended, unavailable, out-of-radius and unverified providers', () => {
  for (const changes of [
    { suspended: true },
    { available: false },
    { distanceKm: 11 },
    { verification: 'DRAFT' },
    { capacity: 0 },
  ])
    assert.equal(rank([{ ...provider, ...changes }], 'plumbing').length, 0);
});
test('explains missing evidence without inventing history', () => {
  const [result] = rank([provider], 'plumbing');
  assert.equal(result.score, 35);
  assert.equal(result.components.ratings.value, null);
});
test('rejects malformed weights and features', () => {
  assert.throws(() => rank([provider], 'plumbing', { skills: 100 }));
  assert.throws(() =>
    rank([{ ...provider, features: { skills: 2 } }], 'plumbing'),
  );
});
