import { useId, useMemo, useState } from "react";
import type { Person, SplitType, SplitMember } from "../types";
import { splitCents, formatCents, parseAmountToCents } from "../engine/money";
import { isSplitValid } from "./expenseValidation";

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
 * Compute each included member's share in cents for preview purposes.
 * Mirrors the engine's computeExpenseShares logic for a single expense.
 */
function previewShares(
  amountCents: number,
  splitType: SplitType,
  members: SplitMember[],
): Map<string, number> {
  const result = new Map<string, number>();
  if (!isSplitValid(amountCents, splitType, members)) return result;

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
  const validationId = useId();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

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
    if (!Number.isSafeInteger(amountCents) || amountCents < 0 ||
        members.some((m) => !Number.isFinite(m.value) || m.value < 0 ||
          (splitType === "exact" && !Number.isSafeInteger(m.value)))) {
      return { ok: false, message: "Enter valid non-negative split values." };
    }
    if (splitType === "exact") {
      const sum = members.reduce((acc, m) => acc + m.value, 0);
      if (!Number.isSafeInteger(sum)) {
        return { ok: false, message: "Exact amounts are too large." };
      }
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
      if (!isSplitValid(amountCents, splitType, members)) {
        return { ok: false, message: `Percentages add up to ${sum}% (must be 100%).` };
      }
      return { ok: true, message: "Percentages add up to 100%." };
    }
    if (splitType === "shares") {
      if (members.some((m) => !Number.isSafeInteger(m.value) || m.value <= 0)) {
        return { ok: false, message: "Every share must be a positive whole number within the supported range." };
      }
      return { ok: true, message: "Split by shares." };
    }
    // equal
    return { ok: true, message: "Split evenly." };
  }, [splitType, members, amountCents]);

  function setSplitType(next: SplitType) {
    if (next === splitType) return;
    setDrafts({});
    // Pre-fill an even distribution so the freshly-switched split starts valid
    // instead of forcing the user to re-type every value from scratch.
    const nextMembers = distributeEvenly(next, amountCents, members);
    onChange({ splitType: next, members: nextMembers });
  }

  function toggleMember(personId: string) {
    setDrafts((previous) => {
      const next = { ...previous };
      delete next[personId];
      return next;
    });
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
    setDrafts((previous) => ({ ...previous, [personId]: raw }));
    let value: number;
    if (asCents) {
      // exact: interpret as a currency amount -> cents
      value = parseAmountToCents(raw) ?? NaN;
    } else {
      const num = /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw.trim()) ? Number(raw) : NaN;
      value = Number.isFinite(num) ? num : NaN;
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
              aria-pressed={active}
              className={
                "rounded-md px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent " +
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

      <ul aria-label="Split participants" className="divide-y divide-line rounded-lg border border-line">
        {people.map((person) => {
          const included = includedIds.has(person.id);
          const member = members.find((m) => m.personId === person.id);
          const share = shares.get(person.id) ?? 0;
          return (
            <li
              key={person.id}
              className="flex items-center gap-3 px-3 py-2"
            >
              <label className="flex min-w-0 flex-1 items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={included}
                  onChange={() => toggleMember(person.id)}
                  className="h-4 w-4 shrink-0 rounded border-line text-accent focus:ring-accent"
                />
                <span
                  className={
                    "min-w-0 [overflow-wrap:anywhere] text-sm " + (included ? "text-fg" : "text-muted")
                  }
                >
                  {person.name}
                </span>
              </label>

              {included && splitType === "exact" && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={`Exact amount for ${person.name}`}
                    aria-invalid={member ? !Number.isSafeInteger(member.value) || member.value < 0 : false}
                    aria-describedby={validationId}
                    value={drafts[person.id] ?? (member && Number.isSafeInteger(member.value) ? formatCents(member.value) : "")}
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
                    type="text"
                    inputMode="decimal"
                    aria-label={`Percentage for ${person.name}`}
                    aria-invalid={member ? !Number.isFinite(member.value) || member.value < 0 || member.value > 100 : false}
                    aria-describedby={validationId}
                    value={drafts[person.id] ?? (member && Number.isFinite(member.value) ? member.value.toString() : "")}
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
                    type="text"
                    inputMode="numeric"
                    aria-label={`Shares for ${person.name}`}
                    aria-invalid={member ? !Number.isSafeInteger(member.value) || member.value <= 0 : false}
                    aria-describedby={validationId}
                    value={drafts[person.id] ?? (member && Number.isFinite(member.value) ? member.value.toString() : "")}
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
        id={validationId}
        role="status"
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
