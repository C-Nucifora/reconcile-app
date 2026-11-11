import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReconcilePdf } from "./ReconcilePdf";
import type { ReportData } from "./report";
import { buildReport } from "./report";
import type { Expense, Group } from "../types";

const sample: ReportData = {
  header: { groupName: "Trip", generatedDate: "2026-06-23" },
  settleUp: {
    netBalances: [
      { name: "Ann", cents: 400 },
      { name: "Bob", cents: -400 },
    ],
    transfers: [{ from: "Bob", to: "Ann", cents: 400 }],
  },
  expenses: [
    {
      description: "Snacks",
      date: "2026-06-21",
      payerName: "Bob",
      amountCents: 1000,
      splitSummary: "Itemised",
      pendingCents: 400,
      items: [
        { name: "Chips", cents: 600, assigneeNames: ["Ann"] },
        { name: "Soda", cents: 400, assigneeNames: [] },
      ],
    },
  ],
  perPerson: [
    {
      name: "Ann",
      paidCents: 2000,
      owedCents: 1600,
      netCents: 400,
      contributions: [{ description: "Dinner", owedCents: 1000 }],
    },
  ],
};

describe("ReconcilePdf", () => {
  it("renders a representative report to a non-empty PDF buffer", async () => {
    const buffer = await renderToBuffer(<ReconcilePdf data={sample} />);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30000);

  it("renders when optional sections are omitted", async () => {
    const buffer = await renderToBuffer(
      <ReconcilePdf data={{ header: sample.header }} />,
    );
    expect(buffer.length).toBeGreaterThan(0);
  }, 30000);
});

// Read PDFKit's page streams and embedded ToUnicode maps, rather than counting
// text operators, which cannot tell whether the right content survived a wrap.
async function pdfPages(buffer: Uint8Array): Promise<string[]> {
  const source = Array.from(buffer, (byte) => String.fromCharCode(byte)).join("");
  const objects = new Map<string, { raw: string; stream: string }>();
  for (const match of source.matchAll(/(\d+) 0 obj\b([\s\S]*?)endobj/g)) {
    const raw = match[2];
    const stream = raw.match(/stream\r?\n([\s\S]*?)\r?\nendstream/)?.[1];
    let decoded = "";
    if (stream) {
      const bytes = Uint8Array.from(stream, (character) => character.charCodeAt(0));
      decoded = /\/FlateDecode/.test(raw)
        ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"))).text()
        : stream;
    }
    objects.set(match[1], { raw, stream: decoded });
  }
  const pages: string[] = [];
  for (const page of objects.values()) {
    if (!/\/Type \/Page\b/.test(page.raw)) continue;
    const resources = objects.get(page.raw.match(/\/Resources (\d+) 0 R/)![1])!.raw;
    const fonts = new Map<string, Map<string, string>>();
    for (const font of resources.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
      const fontObject = objects.get(font[2])!.raw;
      const cmap = objects.get(fontObject.match(/\/ToUnicode (\d+) 0 R/)![1])!.stream;
      const glyphs = new Map<string, string>();
      for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
        for (const mapping of block[1].matchAll(/<([a-f\d]+)>\s*<([a-f\d\s]+)>/gi)) {
          glyphs.set(mapping[1], String.fromCharCode(...mapping[2].replace(/\s/g, "").match(/.{4}/g)!.map((hex) => parseInt(hex, 16))));
        }
      }
      fonts.set(font[1], glyphs);
    }
    const content = objects.get(page.raw.match(/\/Contents (\d+) 0 R/)![1])!.stream;
    let currentFont = "";
    let text = "";
    for (const operation of content.matchAll(/\/(F\d+) [\d.]+ Tf|\[([\s\S]*?)\]\s*TJ/g)) {
      if (operation[1]) { currentFont = operation[1]; continue; }
      for (const encoded of operation[2].matchAll(/<([a-f\d]+)>/gi)) {
        for (const hex of encoded[1].match(/.{4}/g) ?? []) {
          text += fonts.get(currentFont)?.get(hex) ?? "�";
        }
      }
    }
    pages.push(text);
  }
  return pages;
}

it("preserves amounts, pending details, literal untrusted text and Unicode names", async () => {
  const buffer = await renderToBuffer(<ReconcilePdf data={{
    ...sample,
    header: { ...sample.header, groupName: 'Élodie Ω Ж <script>alert("fictional")</script>' },
  }} />);
  const text = (await pdfPages(buffer)).join("\n");
  expect(text).toContain('Élodie Ω Ж <script>alert("fictional")</script>');
  for (const expected of ["Bob pays Ann", "$4.00", "$-4.00", "$10.00", "Chips (Ann)", "Soda (pending)", "$6.00", "$4.00 pending assignment, excluded from balances.", "paid $20.00 · owed $16.00"]) {
    expect(text).toContain(expected);
  }
  expect(buffer.toString()).not.toMatch(/\/(?:JavaScript|JS|URI|EmbeddedFile|Subtype \/Image)\b/);
  expect(buffer.toString()).toContain("Bitstream");
}, 30000);

it("paginates long expenses and a single large item list without losing rows", async () => {
  const data: ReportData = {
    ...sample,
    header: { ...sample.header, groupName: "LongUnbrokenGroupName".repeat(8) },
    expenses: Array.from({ length: 30 }, (_, i) => ({
      ...sample.expenses![0],
      description: `ExpenseMarker${i.toString().padStart(3, "0")} ${"LongUnbrokenName".repeat(8)}`,
      items: Array.from({ length: i === 29 ? 65 : 2 }, (_, j) => ({
        name: `ItemMarker${i.toString().padStart(3, "0")}x${j.toString().padStart(3, "0")}`,
        cents: 600,
        assigneeNames: ["FictionalPerson".repeat(3)],
      })),
    })),
  };
  const buffer = await renderToBuffer(<ReconcilePdf data={data} />);
  const pages = await pdfPages(buffer);
  expect(pages.length).toBeGreaterThan(2);
  const text = pages.join("\n");
  for (let i = 0; i < 30; i++) {
    expect(text.match(new RegExp(`ExpenseMarker${i.toString().padStart(3, "0")}`, "g"))).toHaveLength(1);
    for (let j = 0; j < (i === 29 ? 65 : 2); j++) {
      expect(text.match(new RegExp(`ItemMarker${i.toString().padStart(3, "0")}x${j.toString().padStart(3, "0")}`, "g"))).toHaveLength(1);
    }
  }
  pages.forEach((page, index) => {
    expect(page).toContain(`${index + 1} / ${pages.length}`);
    expect(page).not.toMatch(/(?:Settle up|Expenses|Per person)\d+ \/ \d+$/);
  });
}, 60000);

it("keeps the per person heading with its first person after long settlement names", async () => {
  const people = [{ id: "a", name: "Alex" }, { id: "e", name: "Élodie" },
    { id: "l", name: "FictionalLongName".repeat(20) + '<script>alert("fictional")</script>' }];
  const expense = (id: string, description: string, amountCents: number, splitType: Expense["splitType"], values: number[]): Expense => ({
    id, description, amountCents, splitType, payerId: "a", date: "2026-11-12",
    members: values.map((value, index) => ({ personId: people[index].id, value })),
  });
  const group: Group = { id: "g", name: "Fictional coastal trip", people, expenses: [
    expense("1", "Fictional groceries", 1001, "equal", [0, 0]),
    expense("2", "Decimal percentage", 101, "percent", [.01, 35.95]),
    expense("3", "Share snack", 7, "shares", [2, 1]),
    { ...expense("4", "Itemized picnic", 300, "equal", []), items: [
      { id: "sandwich", name: "Fictional sandwiches", amountCents: 200, assigneeIds: [] },
      { id: "juice", name: "Unassigned juice", amountCents: 100, assigneeIds: [] },
    ] },
    expense("5", "Quota recovery expense", 1234, "equal", [0, 0]),
    expense("6", "Mobile long name", 5, "equal", [0, 0, 0]),
    expense("7", "Removed payer draft", 200, "equal", [0, 0, 0]),
  ] };
  const data = buildReport(group, { generatedDate: "2026-11-12", sections: { settleUp: true, expenses: true, perPerson: true } });
  const pages = await pdfPages(await renderToBuffer(<ReconcilePdf data={data} />));
  const headingPage = pages.find((page) => page.includes("Per person"));
  expect(headingPage).toContain("Alexnet $13.56paid $25.48");
}, 30000);
