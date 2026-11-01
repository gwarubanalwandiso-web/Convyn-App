const providerTransitions = {
  CONFIRMED: 'EN_ROUTE',
  EN_ROUTE: 'ARRIVED',
  ARRIVED: 'IN_PROGRESS',
  IN_PROGRESS: 'AWAITING_CONFIRMATION',
};
export function transitionBooking({ status, actor, next, evidenceCount = 0 }) {
  if (
    actor === 'CUSTOMER' &&
    status === 'AWAITING_CONFIRMATION' &&
    next === 'COMPLETED'
  )
    return next;
  if (actor === 'PROVIDER' && providerTransitions[status] === next) {
    if (
      next === 'AWAITING_CONFIRMATION' &&
      (!Number.isSafeInteger(evidenceCount) || evidenceCount < 1)
    )
      throw new Error('Completion evidence required');
    return next;
  }
  throw new Error('Forbidden booking transition');
}
