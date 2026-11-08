export interface WeightedValue {
  value: number;
  weight: number;
}

export interface QuantileSummary {
  q10: number;
  q25: number;
  q50: number;
  q75: number;
  q90: number;
}

/**
 * Computes a weighted quantile using cumulative weight midpoints and linear interpolation.
 */
export function weightedQuantile(samples: readonly WeightedValue[], q: number): number {
  const valid = samples
    .filter((s) => s.weight > 0 && Number.isFinite(s.value))
    .sort((a, b) => a.value - b.value);

  if (valid.length === 0) {
    throw new Error('Cannot compute weighted quantile of empty sample set');
  }
  const first = valid[0];
  const last = valid[valid.length - 1];
  if (!first || !last || valid.length === 1) {
    return first ? first.value : 0;
  }

  let totalWeight = 0;
  for (const s of valid) {
    totalWeight += s.weight;
  }

  const points: Array<{ value: number; p: number }> = [];
  let cumBefore = 0;
  for (const s of valid) {
    const p = (cumBefore + 0.5 * s.weight) / totalWeight;
    points.push({ value: s.value, p });
    cumBefore += s.weight;
  }

  const pFirst = points[0];
  const pLast = points[points.length - 1];
  if (!pFirst || !pLast || q <= pFirst.p) return first.value;
  if (q >= pLast.p) return last.value;

  let i = 0;
  while (i < points.length - 2 && q > (points[i + 1]?.p ?? 1)) {
    i += 1;
  }
  const left = points[i] ?? { value: first.value, p: 0 };
  const right = points[i + 1] ?? { value: last.value, p: 1 };
  const ratio = (q - left.p) / (right.p - left.p);
  return left.value + ratio * (right.value - left.value);
}

export function weightedQuantiles(samples: readonly WeightedValue[]): QuantileSummary {
  return {
    q10: weightedQuantile(samples, 0.1),
    q25: weightedQuantile(samples, 0.25),
    q50: weightedQuantile(samples, 0.5),
    q75: weightedQuantile(samples, 0.75),
    q90: weightedQuantile(samples, 0.9),
  };
}

export function sampleStdDev(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / values.length;
  let sqDiff = 0;
  for (const v of values) {
    const d = v - mean;
    sqDiff += d * d;
  }
  return Math.sqrt(sqDiff / (values.length - 1));
}
