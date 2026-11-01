import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transitionBooking } from '../../packages/types/src/lifecycle.mjs';
test('provider fulfilment requires evidence and customer confirmation', () => {
  let status = 'CONFIRMED';
  for (const next of [
    'EN_ROUTE',
    'ARRIVED',
    'IN_PROGRESS',
    'AWAITING_CONFIRMATION',
  ])
    status = transitionBooking({
      status,
      next,
      actor: 'PROVIDER',
      evidenceCount: 1,
    });
  assert.equal(
    transitionBooking({ status, next: 'COMPLETED', actor: 'CUSTOMER' }),
    'COMPLETED',
  );
});
test('denies skipping states and provider self-confirmation', () => {
  for (const input of [
    { status: 'CONFIRMED', next: 'COMPLETED', actor: 'PROVIDER' },
    { status: 'AWAITING_CONFIRMATION', next: 'COMPLETED', actor: 'PROVIDER' },
    { status: 'CONFIRMED', next: 'EN_ROUTE', actor: 'CUSTOMER' },
    { status: 'IN_PROGRESS', next: 'AWAITING_CONFIRMATION', actor: 'PROVIDER' },
  ])
    assert.throws(() => transitionBooking(input));
});
test('completed bookings cannot transition again', () =>
  assert.throws(() =>
    transitionBooking({
      status: 'COMPLETED',
      next: 'EN_ROUTE',
      actor: 'PROVIDER',
    }),
  ));
