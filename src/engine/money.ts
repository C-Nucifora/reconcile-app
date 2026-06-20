// Pure money helpers. All amounts are integer cents.

/**
 * Parse a user-entered amount string into integer cents.
 * Trims whitespace, strips a single leading currency symbol and any thousands
 * separators (commas), and accepts up to two decimal places.
 * Returns integer cents, or null when the input is not a valid non-negative amount.
 */
export function parseAmountToCents(input: string): number | null {
  if (typeof input !== "string") return null;

  let s = input.trim();
  if (s === "") return null;

  // Strip a single leading currency symbol (anything that is not a digit, dot,
  // comma, or sign). Common symbols: $ € £ ¥ etc.
  s = s.replace(/^[^\d.,+-]+/, "");

  // Strip a single leading plus sign (we only accept non-negative amounts).
  if (s.startsWith("+")) s = s.slice(1);

  // Reject negatives outright (totals must be >= 0).
  if (s.startsWith("-")) return null;

  // Remove thousands separators (commas).
  s = s.replace(/,/g, "");

  if (s === "") return null;

  // Must be digits with an optional fractional part of up to 2 digits.
  // Allow forms like "12", "12.", "12.5", "12.50", ".5", ".50".
  if (!/^\d*(?:\.\d{0,2})?$/.test(s)) return null;

  // Must contain at least one digit somewhere.
  if (!/\d/.test(s)) return null;

  const [whole, frac = ""] = s.split(".");
  const wholePart = whole === "" ? 0 : Number(whole);
  const fracPadded = (frac + "00").slice(0, 2);
  const fracPart = Number(fracPadded);

  if (!Number.isFinite(wholePart) || !Number.isFinite(fracPart)) return null;

  const cents = wholePart * 100 + fracPart;
  if (!Number.isFinite(cents) || cents < 0) return null;

  return cents;
}

/**
 * Format integer cents as a fixed two-decimal string.
 * Handles negatives, e.g. -1250 -> "-12.50".
 */
export function formatCents(cents: number): string {
  const n = Math.trunc(cents);
  const negative = n < 0;
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const fracStr = frac.toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fracStr}`;
}

/**
 * Allocate totalCents across buckets proportional to weights, using the
 * largest-remainder method so the returned parts sum EXACTLY to totalCents.
 *
 * - Empty weights -> [].
 * - All-zero (or empty after zeroing) weights -> distribute as evenly as
 *   possible (treated as equal weights).
 * Totals are assumed to be >= 0.
 */
export function splitCents(totalCents: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];

  const total = Math.trunc(totalCents);

  // Treat negative weights as 0; they carry no allocation.
  const safeWeights = weights.map((w) => (w > 0 ? w : 0));
  let weightSum = safeWeights.reduce((a, b) => a + b, 0);

  // All-zero weights -> treat as equal distribution.
  let effective = safeWeights;
  if (weightSum === 0) {
    effective = new Array(n).fill(1);
    weightSum = n;
  }

  // Compute floor allocation and remainder for each bucket.
  const floors = new Array<number>(n);
  const remainders = new Array<{ index: number; rem: number }>(n);
  let allocated = 0;

  for (let i = 0; i < n; i++) {
    const exact = (total * effective[i]) / weightSum;
    const floor = Math.floor(exact);
    floors[i] = floor;
    allocated += floor;
    remainders[i] = { index: i, rem: exact - floor };
  }

  let leftover = total - allocated;

  // Distribute the leftover cents to the largest remainders first.
  // Tie-break by index for deterministic output.
  remainders.sort((a, b) => {
    if (b.rem !== a.rem) return b.rem - a.rem;
    return a.index - b.index;
  });

  const result = floors.slice();
  let k = 0;
  while (leftover > 0 && k < remainders.length) {
    result[remainders[k].index] += 1;
    leftover -= 1;
    k += 1;
  }

  // If leftover is somehow negative (only possible with odd rounding), trim
  // from the smallest remainders. Should not happen for total >= 0, but keep
  // the invariant that the parts sum exactly to total.
  let j = remainders.length - 1;
  while (leftover < 0 && j >= 0) {
    if (result[remainders[j].index] > 0) {
      result[remainders[j].index] -= 1;
      leftover += 1;
    }
    j -= 1;
  }

  return result;
}
