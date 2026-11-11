import { describe, it, expect } from "vitest";
import { parseAmountToCents, formatCents, splitCents, sumCents } from "./money";

describe("parseAmountToCents", () => {
  it("parses plain integers", () => {
    expect(parseAmountToCents("12")).toBe(1200);
    expect(parseAmountToCents("0")).toBe(0);
    expect(parseAmountToCents("1000")).toBe(100000);
  });

  it("parses one and two decimal places", () => {
    expect(parseAmountToCents("12.5")).toBe(1250);
    expect(parseAmountToCents("12.50")).toBe(1250);
    expect(parseAmountToCents("0.01")).toBe(1);
    expect(parseAmountToCents("0.99")).toBe(99);
  });

  it("strips a leading currency symbol", () => {
    expect(parseAmountToCents("$12.50")).toBe(1250);
    expect(parseAmountToCents("£5")).toBe(500);
    expect(parseAmountToCents("€0.05")).toBe(5);
  });

  it("strips thousands separators and surrounding whitespace", () => {
    expect(parseAmountToCents(" 1,234.50 ")).toBe(123450);
    expect(parseAmountToCents("$1,234.50")).toBe(123450);
    expect(parseAmountToCents("1,000,000")).toBe(100000000);
  });

  it("accepts a leading dot", () => {
    expect(parseAmountToCents(".5")).toBe(50);
    expect(parseAmountToCents(".05")).toBe(5);
  });

  it("accepts a trailing dot", () => {
    expect(parseAmountToCents("12.")).toBe(1200);
  });

  it("accepts an explicit plus sign", () => {
    expect(parseAmountToCents("+12.50")).toBe(1250);
  });

  it("returns null for invalid or negative input", () => {
    expect(parseAmountToCents("")).toBeNull();
    expect(parseAmountToCents("   ")).toBeNull();
    expect(parseAmountToCents("abc")).toBeNull();
    expect(parseAmountToCents("12.345")).toBeNull();
    expect(parseAmountToCents("-5")).toBeNull();
    expect(parseAmountToCents("$-5")).toBeNull();
    expect(parseAmountToCents("1.2.3")).toBeNull();
    expect(parseAmountToCents("$")).toBeNull();
  });
});

describe("formatCents", () => {
  it("formats positive amounts with two decimals", () => {
    expect(formatCents(1250)).toBe("12.50");
    expect(formatCents(0)).toBe("0.00");
    expect(formatCents(5)).toBe("0.05");
    expect(formatCents(100)).toBe("1.00");
    expect(formatCents(123450)).toBe("1234.50");
  });

  it("formats negative amounts", () => {
    expect(formatCents(-1250)).toBe("-12.50");
    expect(formatCents(-5)).toBe("-0.05");
    expect(formatCents(-100)).toBe("-1.00");
  });
});

describe("parse/format round trip", () => {
  const cases = ["12", "12.5", "12.50", "$12.50", " 1,234.50 ", "0.01", "1000"];
  it("round-trips several inputs", () => {
    for (const input of cases) {
      const cents = parseAmountToCents(input);
      expect(cents).not.toBeNull();
      const formatted = formatCents(cents as number);
      // Re-parsing the formatted string yields the same cents.
      expect(parseAmountToCents(formatted)).toBe(cents);
    }
  });

  it("formats $1,234.50 to the expected string", () => {
    const cents = parseAmountToCents("$1,234.50");
    expect(cents).toBe(123450);
    expect(formatCents(cents as number)).toBe("1234.50");
  });
});

describe("splitCents", () => {
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

  it("returns [] for empty weights", () => {
    expect(splitCents(1000, [])).toEqual([]);
  });

  it("splits 1000 over [1,1,1] summing exactly to 1000 with max diff 1", () => {
    const parts = splitCents(1000, [1, 1, 1]);
    expect(sum(parts)).toBe(1000);
    expect(parts).toHaveLength(3);
    expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
    // Largest-remainder, tie-break by index: first buckets get the extra cent.
    expect(parts).toEqual([334, 333, 333]);
  });

  it("splits a clean even amount", () => {
    expect(splitCents(1000, [1, 1])).toEqual([500, 500]);
  });

  it("handles all-zero weights as equal distribution", () => {
    const parts = splitCents(1000, [0, 0, 0]);
    expect(sum(parts)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
  });

  it("handles percent split 100 over [50,50]", () => {
    const parts = splitCents(100, [50, 50]);
    expect(sum(parts)).toBe(100);
    expect(parts).toEqual([50, 50]);
  });

  it("handles an odd percent split 1000 over [33,33,34]", () => {
    const parts = splitCents(1000, [33, 33, 34]);
    expect(sum(parts)).toBe(1000);
    expect(parts).toHaveLength(3);
    // 34% bucket should get the most.
    expect(parts[2]).toBeGreaterThanOrEqual(parts[0]);
    expect(parts[2]).toBeGreaterThanOrEqual(parts[1]);
  });

  it("handles a shares split 1000 over [1,1,2]", () => {
    const parts = splitCents(1000, [1, 1, 2]);
    expect(sum(parts)).toBe(1000);
    expect(parts).toEqual([250, 250, 500]);
  });

  it("splits 0 across weights as all zeros", () => {
    expect(splitCents(0, [1, 2, 3])).toEqual([0, 0, 0]);
  });

  it("always sums exactly to the total for many weight shapes", () => {
    const totals = [1, 7, 99, 100, 1000, 1234, 999999];
    const shapes = [
      [1, 1, 1],
      [1, 2, 3],
      [33, 33, 34],
      [50, 50],
      [0, 0, 0, 0],
      [5, 0, 5],
      [1],
    ];
    for (const t of totals) {
      for (const w of shapes) {
        const parts = splitCents(t, w);
        expect(sum(parts)).toBe(t);
        expect(parts).toHaveLength(w.length);
        for (const p of parts) expect(p).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("money input boundaries", () => {
  it("sums cents at the safe boundary and rejects invalid inputs or overflow", () => {
    expect(sumCents([])).toBe(0);
    expect(sumCents([Number.MAX_SAFE_INTEGER - 1, 1])).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => sumCents([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
    for (const value of [-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => sumCents([value])).toThrow(RangeError);
      expect(() => splitCents(value, [])).toThrow(RangeError);
    }
  });

  it("round-trips every cent near the upper bound", () => {
    for (let offset = 0; offset < 1000; offset++) {
      const cents = Number.MAX_SAFE_INTEGER - offset;
      expect(parseAmountToCents(formatCents(cents))).toBe(cents);
    }
  });

  it.each(["abc12", "USD12", "$$12", "1,2", "12,34.00", "1.2,3", "1e3", "NaN", "Infinity", "-0", "90071992547409.92"])("rejects %s", (input) => {
    expect(parseAmountToCents(input)).toBeNull();
  });

  it("parses and formats the largest safe cent amount without rounding", () => {
    expect(parseAmountToCents("90,071,992,547,409.91")).toBe(Number.MAX_SAFE_INTEGER);
    expect(formatCents(Number.MAX_SAFE_INTEGER)).toBe("90071992547409.91");
    expect(formatCents(-Number.MAX_SAFE_INTEGER)).toBe("-90071992547409.91");
  });

  it.each([NaN, Infinity, -Infinity, 0.1, Number.MAX_SAFE_INTEGER + 1])("rejects invalid formatting and split totals %s", (value) => {
    expect(() => formatCents(value)).toThrow(RangeError);
    expect(() => splitCents(value, [1, 1])).toThrow(RangeError);
  });

  it("rejects refunds and invalid weights", () => {
    expect(() => splitCents(-1, [1])).toThrow(RangeError);
    for (const weight of [NaN, Infinity, -Infinity, -1]) {
      expect(() => splitCents(100, [weight, 1])).toThrow(RangeError);
    }
  });

  it("uses exact decimal proportions and deterministic remainder ties", () => {
    expect(splitCents(5, [0.1, 0.2, 0.3])).toEqual([1, 2, 2]);
    expect(splitCents(2, [1, 1, 1])).toEqual([1, 1, 0]);
    expect(splitCents(Number.MAX_SAFE_INTEGER, [Number.MAX_VALUE, Number.MAX_VALUE])).toEqual([4503599627370496, 4503599627370495]);
    expect(splitCents(3, [Number.MIN_VALUE, Number.MIN_VALUE])).toEqual([2, 1]);
  });

  it("conserves cents across varied totals and extreme weights", () => {
    const totals = [0, 1, 2, 101, 1000001, Number.MAX_SAFE_INTEGER];
    const weights = [[1], [1, 1, 1], [0, 0, 0], [0, 1, 0], [0.01, 0.99], [1e-300, 1e300, 1], [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE]];
    for (const total of totals) for (const ratio of weights) {
      const parts = splitCents(total, ratio);
      expect(parts.every((part) => Number.isSafeInteger(part) && part >= 0)).toBe(true);
      expect(parts.reduce((sum, part) => sum + BigInt(part), 0n)).toBe(BigInt(total));
      expect(splitCents(total, ratio)).toEqual(parts);
    }
  });
});
