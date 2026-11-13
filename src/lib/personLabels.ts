import type { ID, Person } from "../types";

export function personLabels(people: readonly Person[]): Map<ID, string> {
  const counts = new Map<string, number>();
  for (const person of people) {
    const key = person.name.normalize("NFC");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // Reserve raw names too, so generated labels cannot impersonate another person.
  const used = new Set(counts.keys());
  const nextSuffix = new Map<string, number>();
  const labels = new Map<ID, string>();
  for (const person of people) {
    const key = person.name.normalize("NFC");
    let label = person.name;
    if (counts.get(key)! > 1) {
      let suffix = nextSuffix.get(key) ?? 1;
      do {
        label = `${person.name} (${suffix++})`;
      } while (used.has(label.normalize("NFC")));
      nextSuffix.set(key, suffix);
      used.add(label.normalize("NFC"));
    }
    labels.set(person.id, label);
  }
  return labels;
}
