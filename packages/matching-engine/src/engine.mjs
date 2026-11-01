export const defaultWeights = Object.freeze({
  skills: 20,
  ratings: 15,
  jobs: 15,
  credentials: 15,
  reliability: 15,
  proximity: 10,
  response: 5,
  recommendations: 5,
});
export function rank(candidates, category, weights = defaultWeights) {
  const entries = Object.entries(weights);
  if (
    entries.length !== 8 ||
    Object.keys(defaultWeights).some((k) => !Object.hasOwn(weights, k)) ||
    entries.some(([, v]) => !Number.isFinite(v) || v < 0) ||
    Math.abs(entries.reduce((s, [, v]) => s + v, 0) - 100) > 1e-9
  )
    throw new RangeError('Weights must total 100');
  return candidates
    .filter(
      (p) =>
        p.verification === 'APPROVED' &&
        p.available &&
        !p.suspended &&
        p.categories.includes(category) &&
        Number.isFinite(p.distanceKm) &&
        p.distanceKm >= 0 &&
        p.distanceKm <= p.radiusKm &&
        p.capacity > 0,
    )
    .map((p) => {
      const components = Object.fromEntries(
        entries.map(([k, w]) => {
          const value = p.features[k];
          if (
            value !== undefined &&
            (!Number.isFinite(value) || value < 0 || value > 1)
          )
            throw new RangeError('Feature outside 0..1');
          return [k, { value: value ?? null, contribution: (value ?? 0) * w }];
        }),
      );
      return {
        id: p.id,
        version: 'weighted-v1',
        score: Object.values(components).reduce(
          (s, c) => s + c.contribution,
          0,
        ),
        components,
        explanation:
          'Missing evidence contributes zero; eligibility checked before scoring.',
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
