const integer = (n, name) => {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(name);
  return BigInt(n);
};
export function quote(input) {
  const {
    labour,
    callout = 0,
    travel = 0,
    materials = 0,
    surchargeBps = 0,
    maxSurchargeBps = 5000,
    taxBps = 0,
    discount = 0,
    version,
  } = input;
  if (typeof version !== 'string' || !version.trim())
    throw new TypeError('Rule version required');
  const base =
    integer(labour, 'labour') +
    integer(callout, 'callout') +
    integer(travel, 'travel') +
    integer(materials, 'materials');
  const rate = integer(surchargeBps, 'surchargeBps');
  const cap = integer(maxSurchargeBps, 'maxSurchargeBps');
  const surcharge = (base * (rate < cap ? rate : cap) + 5000n) / 10000n;
  const reduction = integer(discount, 'discount');
  if (reduction > base + surcharge)
    throw new RangeError('Discount exceeds subtotal');
  const subtotal = base + surcharge - reduction;
  const tax = (subtotal * integer(taxBps, 'taxBps') + 5000n) / 10000n;
  const total = subtotal + tax;
  if (total > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError('Total overflow');
  return {
    subtotal: Number(subtotal),
    tax: Number(tax),
    total: Number(total),
    surcharge: Number(surcharge),
    currency: 'ZAR',
    version,
  };
}
