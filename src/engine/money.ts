// Pure money helpers. All amounts are integer cents; refunds are not supported.

export function isValidCents(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/** Parse non-negative currency with at most two decimal places. */
export function parseAmountToCents(input: string): number | null {
  if (typeof input !== "string") return null;
  const value = input.trim().replace(/^\p{Sc}/u, "").replace(/^\+/, "");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)?(?:\.\d{0,2})?$/.test(value) || !/\d/.test(value)) {
    return null;
  }
  const [whole, fraction = ""] = value.replace(/,/g, "").split(".");
  const cents = BigInt(whole || "0") * 100n + BigInt((fraction + "00").slice(0, 2));
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

/** Format signed integer cents without passing through floating-point dollars. */
export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError("Amount must be safe integer cents.");
  const amount = BigInt(cents);
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

/** Sum non-negative cents, rejecting totals that would lose precision. */
export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) {
    if (!isValidCents(value) || !isValidCents(total + value)) {
      throw new RangeError("Amount must be non-negative safe integer cents.");
    }
    total += value;
  }
  return total;
}

/**
 * Largest-remainder allocation, with ties going to earlier buckets.
 * Empty weights return []; all-zero weights split equally. Invalid totals or
 * weights are rejected. Decimal weights use their displayed decimal values.
 */
export function splitCents(totalCents: number, weights: number[]): number[] {
  if (!isValidCents(totalCents)) throw new RangeError("Total must be non-negative safe integer cents.");
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new RangeError("Weights must be finite and non-negative.");
  }
  if (weights.length === 0) return [];

  // Integer ratios avoid overflow and lost cents even for extreme weight sizes.
  const decimals = weights.map((weight) => {
    const [coefficient, exponent = "0"] = weight.toString().split("e");
    const [whole, fraction = ""] = coefficient.split(".");
    return { digits: BigInt(whole + fraction), scale: fraction.length - Number(exponent) };
  });
  const scale = decimals.reduce((max, decimal) => Math.max(max, decimal.scale), -Infinity);
  let integers = decimals.map(({ digits, scale: places }) => digits * 10n ** BigInt(scale - places));
  let weightSum = integers.reduce((sum, weight) => sum + weight, 0n);
  if (weightSum === 0n) {
    integers = weights.map(() => 1n);
    weightSum = BigInt(weights.length);
  }
  const total = BigInt(totalCents);
  const allocations = integers.map((weight, index) => ({
    index,
    floor: total * weight / weightSum,
    remainder: total * weight % weightSum,
  }));
  const parts = allocations.map(({ floor }) => Number(floor));
  const remaining = Number(total - allocations.reduce((sum, part) => sum + part.floor, 0n));
  allocations.sort((a, b) => a.remainder === b.remainder
    ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (let i = 0; i < remaining; i++) parts[allocations[i].index] += 1;
  return parts;
}
