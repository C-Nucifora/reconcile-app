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
async function pdfPages(buffer: Uint8Array, objectBoundaries = false): Promise<string[]> {
  const source = Array.from(buffer, (byte) => String.fromCharCode(byte)).join("");
  const objects = new Map<string, { raw: string; stream: string }>();
  for (const match of source.matchAll(/(\d+) 0 obj\b([\s\S]*?)endobj/g)) {
    const raw = match[2];
    const streamHeader = /\bstream\r?\n/.exec(raw);
    let stream: string | undefined;
    if (streamHeader) {
      // Stream bytes can end in CR or contain delimiters; PDFKit supplies their exact length.
      const length = Number(raw.match(/\/Length\s+(\d+)\b/)![1]);
      const start = match.index! + match[1].length + " 0 obj".length + streamHeader.index + streamHeader[0].length;
      stream = source.slice(start, start + length);
      expect(stream.length).toBe(length);
    }
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
    for (const operation of content.matchAll(/\/(F\d+) [\d.]+ Tf|\[([^\]]*)\]\s*TJ|\bET\b/g)) {
      if (operation[0] === "ET") {
        if (objectBoundaries) text += "\n";
        continue;
      }
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

it("prints distinct payment parties for duplicate names and literal suffix collisions", async () => {
  const group: Group = {
    id: "fictional-names", name: "Fictional shared names",
    people: [{ id: "a", name: "Alex" }, { id: "b", name: "Alex" }, { id: "c", name: "Alex (1)" }],
    expenses: [{ id: "fictional-meal", description: "Fictional meal", amountCents: 100,
      payerId: "a", date: "2026-11-12", splitType: "exact", members: [{ personId: "b", value: 100 }] }],
  };
  const data = buildReport(group, {
    sections: { settleUp: true, expenses: true, perPerson: true }, generatedDate: "2026-11-12",
  });
  const buffer = await renderToBuffer(<ReconcilePdf data={data} />);
  const text = (await pdfPages(buffer)).join("\n");
  expect(text).toContain("Alex (3) pays Alex (2)");
  expect(text).toContain("paid by Alex (2)");
  expect(text).toContain("Alex (1)");
  expect(text).toContain("$1.00");
  expect(group.people.map((person) => person.name)).toEqual(["Alex", "Alex", "Alex (1)"]);
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

describe("round4 PDF selection and paragraph audit", () => {
  it.each(Array.from({ length: 8 }, (_, bits) => ({
    settleUp: Boolean(bits & 1), expenses: Boolean(bits & 2), perPerson: Boolean(bits & 4),
  })))("prints only selected sections and their amounts for %j", async (sections) => {
    const group: Group = {
      id: "fictional-r4-sections", name: "FictionalR4Header",
      people: [{ id: "payer", name: "FictionalR4Payer" }, { id: "debtor", name: "FictionalR4Debtor" }],
      expenses: [{
        id: "fictional-r4-expense", description: "FictionalR4Contribution", date: "2026-11-12",
        payerId: "payer", amountCents: 579, splitType: "equal", members: [],
        receiptImageId: "fictional-r4-private-receipt-never-print",
        items: [
          { id: "assigned", name: "FictionalR4Assigned", amountCents: 123, assigneeIds: ["debtor"] },
          { id: "pending", name: "FictionalR4Pending", amountCents: 456, assigneeIds: [] },
        ],
      }],
    };
    const before = structuredClone(group);
    const data = buildReport(group, { sections, generatedDate: "2026-11-12" });
    const buffer = await renderToBuffer(<ReconcilePdf data={data} />);
    const pages = await pdfPages(buffer);
    // Preserve text-object boundaries so numeric footers cannot merge with an amount.
    const amounts = (await pdfPages(buffer, true)).join("\n");
    expect(pages).toHaveLength(1);
    const text = pages[0];
    expect(text).toContain("FictionalR4HeaderGenerated 2026-11-12");
    for (const [selected, markers] of [
      [sections.settleUp, ["Settle up", "FictionalR4Debtor pays FictionalR4Payer"]],
      [sections.expenses, ["Expenses", "FictionalR4Assigned (FictionalR4Debtor)",
        "FictionalR4Pending (pending)", "$5.79", "$4.56 pending assignment, excluded from balances."]],
      [sections.perPerson, ["Per person", "paid $1.23 · owed $0.00", "paid $0.00 · owed $1.23"]],
    ] as const) {
      for (const marker of markers) expect(text.includes(marker), marker).toBe(selected);
    }
    // The same debt appears in transfer, balance, item and person details.
    expect(amounts.match(/\$1\.23(?!\d)/g) ?? []).toHaveLength(
      2 * Number(sections.settleUp) + Number(sections.expenses) + 4 * Number(sections.perPerson),
    );
    expect(amounts.match(/\$-1\.23(?!\d)/g) ?? []).toHaveLength(Number(sections.settleUp) + Number(sections.perPerson));
    expect(amounts.match(/\$4\.56(?!\d)/g) ?? []).toHaveLength(2 * Number(sections.expenses));
    expect(text.match(/FictionalR4Contribution/g) ?? []).toHaveLength(Number(sections.expenses) + Number(sections.perPerson));
    expect(text).not.toContain("fictional-r4-private-receipt-never-print");
    expect(text).toContain("1 / 1");
    expect(group).toEqual(before);
  }, 20000);

  it("retains every word of supported 10000-character names and pending paragraphs across pages", async () => {
    const paragraphs = ["FictionalNameR4", "FictionalDescR4", "FictionalItemR4"].map((prefix) => {
      const words = Array.from({ length: 500 }, (_, index) => `${prefix}${index.toString().padStart(4, "0")}`);
      const text = `${words.join(" ")}.`;
      expect(text).toHaveLength(10000);
      return { prefix, words, text };
    });
    const group: Group = {
      id: "fictional-r4-paragraphs", name: paragraphs[0].text,
      people: [{ id: "payer", name: "Fictional paragraph payer" }],
      expenses: [{
        id: "fictional-r4-pending-paragraph", description: paragraphs[1].text,
        date: "2026-11-12", payerId: "payer", amountCents: 791, splitType: "equal", members: [],
        items: [{ id: "pending", name: paragraphs[2].text, amountCents: 791, assigneeIds: [] }],
      }],
    };
    const data = buildReport(group, {
      sections: { settleUp: false, expenses: true, perPerson: false }, generatedDate: "2026-11-12",
    });
    const buffer = await renderToBuffer(<ReconcilePdf data={data} />);
    const pages = await pdfPages(buffer);
    const amounts = (await pdfPages(buffer, true)).join("\n");
    expect(pages.length).toBeGreaterThan(3);
    const text = pages.join("\n");
    for (const paragraph of paragraphs) {
      expect(text.match(new RegExp(`${paragraph.prefix}\\d{4}`, "g"))).toEqual(paragraph.words);
    }
    expect(amounts.match(/\$7\.91(?!\d)/g)).toHaveLength(3);
    expect(text).toContain("$7.91 pending assignment, excluded from balances.");
    expect(text.match(/\(pending\)/g)).toHaveLength(1);
    expect(text).not.toContain("Settle up");
    expect(text).not.toContain("Per person");
    pages.forEach((page, index) => expect(page).toContain(`${index + 1} / ${pages.length}`));
  }, 20000);
});
