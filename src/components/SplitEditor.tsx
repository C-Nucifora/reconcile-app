import { useMemo } from "react";
import type { Person, SplitType, SplitMember } from "../types";
import { splitCents, formatCents } from "../engine/money";

export interface SplitEditorValue {
  splitType: SplitType;
  members: SplitMember[];
}

interface SplitEditorProps {
  amountCents: number;
  people: Person[];
  value: SplitEditorValue;
  onChange: (v: SplitEditorValue) => void;
}

const SPLIT_TYPES: { type: SplitType; label: string }[] = [
  { type: "equal", label: "Equal" },
  { type: "exact", label: "Exact" },
  { type: "percent", label: "Percent" },
  { type: "shares", label: "Shares" },
];

/**
 * Pure validity check for a split. Shared by SplitEditor's inline message
 * and by ExpenseForm to decide whether submit is enabled.
 */
export function isSplitValid(
  amountCents: number,
  splitType: SplitType,
  members: SplitMember[],
): boolean {
  if (members.length === 0) return false;
  if (splitType === "exact") {
    return members.reduce((acc, m) => acc + m.value, 0) === amountCents;
  }
  if (splitType === "percent") {
    return members.reduce((acc, m) => acc + m.value, 0) === 100;
  }
  if (splitType === "shares") {
    return members.every((m) => m.value > 0);
  }
  return true; // equal
}

/**
 * Compute each included member's share in cents for preview purposes.
 * Mirrors the engine's computeExpenseShares logic for a single expense.
 */
function previewShares(
  amountCents: number,
  splitType: SplitType,
  members: SplitMember[],
): Map<string, number> {
  const result = new Map<string, number>();
  if (members.length === 0) return result;

  if (splitType === "exact") {
    for (const m of members) result.set(m.personId, m.value);
    return result;
  }

  let weights: number[];
  if (splitType === "equal") {
    weights = members.map(() => 1);
  } else if (splitType === "percent") {
    weights = members.map((m) => m.value);
  } else {
    // shares
    weights = members.map((m) => m.value);
  }

  const cents = splitCents(amountCents, weights);
  members.forEach((m, i) => result.set(m.personId, cents[i] ?? 0));
  return result;
}

export default function SplitEditor({
  amountCents,
  people,
  value,
  onChange,
}: SplitEditorProps) {
  const { splitType, members } = value;

  const includedIds = useMemo(
    () => new Set(members.map((m) => m.personId)),
    [members],
  );

  const shares = useMemo(
    () => previewShares(amountCents, splitType, members),
    [amountCents, splitType, members],
  );

  const validation = useMemo(() => {
    if (members.length === 0) {
      return { ok: false, message: "Select at least one person." };
    }
    if (splitType === "exact") {
      const sum = members.reduce((acc, m) => acc + m.value, 0);
      if (sum !== amountCents) {
        const diff = amountCents - sum;
        return {
          ok: false,
          message:
            diff > 0
              ? `${formatCents(diff)} left to assign.`
              : `Over by ${formatCents(-diff)}.`,
        };
      }
      return { ok: true, message: "Exact amounts match the total." };
    }
    if (splitType === "percent") {
      const sum = members.reduce((acc, m) => acc + m.value, 0);
      if (sum !== 100) {
        return { ok: false, message: `Percentages add up to ${sum}% (must be 100%).` };
      }
      return { ok: true, message: "Percentages add up to 100%." };
    }
    if (splitType === "shares") {
      if (members.some((m) => !(m.value > 0))) {
        return { ok: false, message: "Every share must be a positive number." };
      }
      return { ok: true, message: "Split by shares." };
    }
    // equal
    return { ok: true, message: "Split evenly." };
  }, [splitType, members, amountCents]);

  function setSplitType(next: SplitType) {
    if (next === splitType) return;
    // Pre-fill an even distribution so the freshly-switched split starts valid
    // instead of forcing the user to re-type every value from scratch.
    const nextMembers = distributeEvenly(next, amountCents, members);
    onChange({ splitType: next, members: nextMembers });
  }

  function toggleMember(personId: string) {
    if (includedIds.has(personId)) {
      onChange({
        splitType,
        members: members.filter((m) => m.personId !== personId),
      });
    } else {
      onChange({
        splitType,
        members: [...members, { personId, value: defaultValueFor(splitType) }],
      });
    }
  }

  function setMemberValue(personId: string, raw: string, asCents: boolean) {
    let value: number;
    if (asCents) {
      // exact: interpret as a currency amount -> cents
      const num = Number(raw);
      value = Number.isFinite(num) ? Math.round(num * 100) : 0;
    } else {
      const num = Number(raw);
      value = Number.isFinite(num) ? num : 0;
    }
    onChange({
      splitType,
      members: members.map((m) =>
        m.personId === personId ? { ...m, value } : m,
      ),
    });
  }

  return (
    <div className="space-y-3">
      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-line bg-surface-2 p-1">
        {SPLIT_TYPES.map(({ type, label }) => {
          const active = type === splitType;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setSplitType(type)}
              className={
                "rounded-md px-3 py-1.5 text-sm font-medium transition " +
                (active
                  ? "bg-accent text-accent-fg"
                  : "text-muted hover:bg-surface-2")
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      <ul className="divide-y divide-line rounded-lg border border-line">
        {people.map((person) => {
          const included = includedIds.has(person.id);
          const member = members.find((m) => m.personId === person.id);
          const share = shares.get(person.id) ?? 0;
          return (
            <li
              key={person.id}
              className="flex items-center gap-3 px-3 py-2"
            >
              <label className="flex flex-1 items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={included}
                  onChange={() => toggleMember(person.id)}
                  className="h-4 w-4 rounded border-line text-accent focus:ring-accent"
                />
                <span
                  className={
                    "text-sm " + (included ? "text-fg" : "text-muted")
                  }
                >
                  {person.name}
                </span>
              </label>

              {included && splitType === "exact" && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={member ? (member.value / 100).toString() : ""}
                    onChange={(e) =>
                      setMemberValue(person.id, e.target.value, true)
                    }
                    className="w-24 rounded-lg border border-line bg-surface px-2 py-1 text-right text-sm tabular-nums text-fg focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              )}

              {included && splitType === "percent" && (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    inputMode="numeric"
                    value={member ? member.value.toString() : ""}
                    onChange={(e) =>
                      setMemberValue(person.id, e.target.value, false)
                    }
                    className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-right text-sm tabular-nums text-fg focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <span className="text-xs text-muted">%</span>
                </div>
              )}

              {included && splitType === "shares" && (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="1"
                    min="1"
                    inputMode="numeric"
                    value={member ? member.value.toString() : ""}
                    onChange={(e) =>
                      setMemberValue(person.id, e.target.value, false)
                    }
                    className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-right text-sm tabular-nums text-fg focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <span className="text-xs text-muted">sh</span>
                </div>
              )}

              {included && (
                <span className="w-20 text-right text-sm font-medium tabular-nums text-fg">
                  {formatCents(share)}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <p
        className={
          "text-xs " + (validation.ok ? "text-positive" : "text-negative")
        }
      >
        {validation.message}
      </p>
    </div>
  );
}

function defaultValueFor(splitType: SplitType): number {
  switch (splitType) {
    case "shares":
      return 1;
    case "percent":
      return 0;
    case "exact":
      return 0;
    default:
      return 0;
  }
}

/**
 * Produce member values for a freshly-switched split type that start out valid:
 *  - equal:   values ignored, set to 0.
 *  - shares:  one share each.
 *  - percent: percentage points summing to exactly 100 (largest-remainder).
 *  - exact:   cents summing to exactly amountCents (largest-remainder).
 */
function distributeEvenly(
  next: SplitType,
  amountCents: number,
  members: SplitMember[],
): SplitMember[] {
  const n = members.length;
  if (n === 0) return [];

  if (next === "shares") {
    return members.map((m) => ({ personId: m.personId, value: 1 }));
  }
  if (next === "percent") {
    const parts = splitCents(100, members.map(() => 1));
    return members.map((m, i) => ({ personId: m.personId, value: parts[i] }));
  }
  if (next === "exact") {
    const parts = splitCents(amountCents, members.map(() => 1));
    return members.map((m, i) => ({ personId: m.personId, value: parts[i] }));
  }
  // equal: values are ignored.
  return members.map((m) => ({ personId: m.personId, value: 0 }));
}
