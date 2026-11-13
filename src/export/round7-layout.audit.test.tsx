import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import type { Group } from "../types";
import { ReconcilePdf } from "./ReconcilePdf";
import { buildReport } from "./report";

type Matrix = [number, number, number, number, number, number];
type PdfFont = { unicode: Map<number, string>; widths: number[] };
type TextObject = { text: string; left: number; right: number; baseline: number; size: number };
type PdfPage = { width: number; height: number; objects: TextObject[] };
const identity = (): Matrix => [1, 0, 0, 1, 0, 0];

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

// This deliberately supports PDFKit's current horizontal text operators only.
// Unknown positioning must fail the fixture rather than manufacture layout evidence.
function textObjects(content: string, height: number, fonts: Map<string, PdfFont>): TextObject[] {
  expect(content).not.toMatch(/\b(?:Tj|Td|TD|Tc|Tw|Tz|Ts)\b|T\*/);
  const number = "-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
  const matrix = `((?:${number}\\s+){5}${number})\\s+(cm|Tm)`;
  const operations = new RegExp(`${matrix}|\\/(F\\d+)\\s+(${number})\\s+Tf|\\[([^\\]]*)\\]\\s*TJ|\\b(q|Q|BT|ET)\\b`, "g");
  const stack: Matrix[] = [];
  const objects: TextObject[] = [];
  let ctm = identity();
  let tm = identity();
  let font: PdfFont | undefined;
  let size = 0;
  let cursor = 0;
  let object: TextObject | undefined;
  for (const operation of content.matchAll(operations)) {
    if (operation[1]) {
      const value = operation[1].trim().split(/\s+/).map(Number) as Matrix;
      if (operation[2] === "cm") ctm = multiply(ctm, value);
      else { tm = value; cursor = 0; }
    } else if (operation[3]) {
      font = fonts.get(operation[3]);
      expect(font, operation[3]).toBeDefined();
      size = Number(operation[4]);
    } else if (operation[5] !== undefined) {
      if (!font || !object) throw new Error("TJ without a known font and text object");
      const transform = multiply(ctm, tm);
      expect([transform[0], transform[1], transform[2], Math.abs(transform[3])]).toEqual([1, 0, 0, 1]);
      for (const token of operation[5].matchAll(/<([a-f\d]+)>|(-?(?:\d+(?:\.\d*)?|\.\d+))/gi)) {
        if (token[2]) { cursor -= Number(token[2]) * size / 1000; continue; }
        expect(token[1].length % 4).toBe(0);
        for (const hex of token[1].match(/.{4}/g) ?? []) {
          const cid = parseInt(hex, 16);
          const character = font.unicode.get(cid);
          const width = font.widths[cid];
          if (character === undefined || !Number.isFinite(width)) throw new Error(`Unknown CID ${hex}`);
          object.text += character;
          object.left = Math.min(object.left, transform[4] + cursor);
          cursor += width * size / 1000;
          object.right = Math.max(object.right, transform[4] + cursor);
          object.baseline = height - transform[5];
          object.size = size;
        }
      }
    } else {
      switch (operation[6]) {
        case "q": stack.push([...ctm]); break;
        case "Q": {
          const restored = stack.pop();
          if (!restored) throw new Error("Unbalanced PDF graphics stack");
          ctm = restored;
          break;
        }
        case "BT":
          // The installed writer emits Tf for every object; refuse inherited text state.
          font = undefined; size = 0;
          tm = identity(); cursor = 0;
          object = { text: "", left: Infinity, right: -Infinity, baseline: 0, size: 0 };
          break;
        case "ET":
          if (object?.text) objects.push(object);
          object = undefined;
          break;
      }
    }
  }
  expect(stack).toEqual([]);
  expect(objects.length).toBeGreaterThan(0);
  return objects;
}

function readPdf(buffer: Buffer): PdfPage[] {
  const source = buffer.toString("latin1");
  const xrefOffset = Number(source.match(/startxref\s+(\d+)\s+%%EOF\s*$/)![1]);
  const xref = source.slice(xrefOffset).split(/\r?\n/);
  expect(xref[0]).toBe("xref");
  expect(xref[1]).toMatch(/^0 \d+$/);
  const count = Number(xref[1].split(" ")[1]);
  const offsets = xref.slice(3, count + 2).map((entry, index) => {
    expect(entry).toMatch(/^\d{10} 00000 n\s*$/);
    return { id: String(index + 1), offset: Number(entry.slice(0, 10)) };
  }).sort((a, b) => a.offset - b.offset);
  const objects = new Map<string, { raw: string; stream: string }>();
  offsets.forEach(({ id, offset }, index) => {
    const raw = source.slice(offset, offsets[index + 1]?.offset ?? xrefOffset);
    expect(raw.startsWith(`${id} 0 obj`)).toBe(true);
    const header = /\bstream\r?\n/.exec(raw);
    let stream = "";
    if (header) {
      const dictionary = raw.slice(0, header.index);
      const length = Number(dictionary.match(/\/Length\s+(\d+)\b/)![1]);
      const start = offset + header.index + header[0].length;
      const bytes = buffer.subarray(start, start + length);
      expect(bytes.length).toBe(length);
      expect(source.slice(start + length)).toMatch(/^\r?\nendstream/);
      stream = (/\/FlateDecode\b/.test(dictionary) ? inflateSync(bytes) : bytes).toString("utf8");
    }
    objects.set(id, { raw, stream });
  });
  const get = (id: string) => {
    const object = objects.get(id);
    if (!object) throw new Error(`Missing PDF object ${id}`);
    return object;
  };
  const tree = [...objects.values()].filter((object) => /\/Type \/Pages\b/.test(object.raw));
  expect(tree).toHaveLength(1);
  const kids = tree[0].raw.match(/\/Kids\s*\[([^\]]+)\]/)![1];
  const pages: PdfPage[] = [];
  for (const reference of kids.matchAll(/(\d+) 0 R/g)) {
    const page = get(reference[1]);
    expect(page.raw).toMatch(/\/Type \/Page\b/);
    const resources = get(page.raw.match(/\/Resources (\d+) 0 R/)![1]).raw;
    const fonts = new Map<string, PdfFont>();
    for (const reference of resources.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
      const font = get(reference[2]).raw;
      const cmap = get(font.match(/\/ToUnicode (\d+) 0 R/)![1]).stream;
      const unicode = new Map<number, string>();
      for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
        for (const mapping of block[1].matchAll(/<([a-f\d]+)>\s*<([a-f\d\s]+)>/gi)) {
          const units = mapping[2].replace(/\s/g, "").match(/.{4}/g)!;
          unicode.set(parseInt(mapping[1], 16), String.fromCharCode(...units.map((hex) => parseInt(hex, 16))));
        }
      }
      const descendant = get(font.match(/\/DescendantFonts\s*\[(\d+) 0 R\]/)![1]).raw;
      // PDFKit embeds CID widths as /W [0 [w0 w1 ...]].
      const widths = descendant.match(/\/W\s*\[0\s*\[([^\]]+)\]\]/)![1].trim().split(/\s+/).map(Number);
      fonts.set(reference[1], { unicode, widths });
    }
    const box = page.raw.match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/)!;
    const width = Number(box[1]);
    const height = Number(box[2]);
    const content = get(page.raw.match(/\/Contents (\d+) 0 R/)![1]).stream;
    pages.push({ width, height, objects: textObjects(content, height, fonts) });
  }
  expect(pages.length).toBeGreaterThan(0);
  return pages;
}

const sections = { settleUp: true, expenses: true, perPerson: true };
const generatedDate = "2026-11-12";
const tokens = (pages: PdfPage[]) => pages.flatMap((page) => page.objects.flatMap((object) =>
  Array.from(object.text.matchAll(/\$-?\d+\.\d{2}(?!\d)/g), (match) => match[0]),
));
const normalizedText = (pages: PdfPage[]) => pages.flatMap((page) => page.objects.map((object) => object.text)).join("").normalize("NFC");

function layoutViolations(pages: PdfPage[]): string[] {
  const violations: string[] = [];
  pages.forEach((page, index) => {
    for (const object of page.objects) {
      if (object.left < 35.5 || object.right > page.width - 35.5 || object.baseline < 36 || object.baseline > page.height - 17) {
        violations.push(`page ${index + 1} outside content bounds: ${JSON.stringify(object)}`);
      }
      if (!/^\$-?\d+\.\d{2}$/.test(object.text)) continue;
      for (const label of page.objects) {
        if (label === object || label.text.includes("$") || Math.abs(label.baseline - object.baseline) > .5) continue;
        if (label.left < object.right - .5 && label.right > object.left + .5) {
          violations.push(`page ${index + 1} amount overlaps label: ${JSON.stringify({ amount: object, label })}`);
        }
      }
    }
  });
  return violations;
}

describe("round7 actual PDF layout audit", () => {
  it("calibrates glyph advances, TJ adjustments and restored PDF transforms", () => {
    const fonts = new Map([["F1", { unicode: new Map([[1, "A"], [2, "B"]]), widths: [0, 500, 600] }]]);
    const objects = textObjects(`q
1 0 0 -1 0 100 cm
q
1 0 0 1 20 30 cm
BT
1 0 0 1 0 0 Tm
/F1 10 Tf
[<00010002> -100 <0001>] TJ
ET
Q
BT
1 0 0 1 5 10 Tm
/F1 10 Tf
[<0002>] TJ
ET
Q`, 100, fonts);
    expect(objects).toEqual([
      { text: "ABA", left: 20, right: 37, baseline: 30, size: 10 },
      { text: "B", left: 5, right: 11, baseline: 10, size: 10 },
    ]);
  });

  it("refuses inherited font state instead of guessing after graphics restoration", () => {
    const fonts = new Map([["F1", { unicode: new Map([[1, "A"]]), widths: [0, 500] }]]);
    expect(() => textObjects(`q
1 0 0 -1 0 100 cm
BT
1 0 0 1 5 10 Tm
/F1 10 Tf
[<0001>] TJ
ET
q
BT
1 0 0 1 10 20 Tm
/F1 20 Tf
[<0001>] TJ
ET
Q
BT
1 0 0 1 5 30 Tm
[<0001>] TJ
ET
Q`, 100, fonts)).toThrow("TJ without a known font and text object");
  });

  it("preserves exact safe-maximum amounts in every report section without overlap", async () => {
    const group: Group = {
      id: "fictional-r7-wide", name: "Fictional wide monetary columns",
      people: [{ id: "payer", name: "Fictional creditor " + "Wide label ".repeat(12) },
        { id: "debtor", name: "Fictional debtor " + "Wide label ".repeat(12) }],
      expenses: [{ id: "max", description: "Fictional maximum " + "Wide description ".repeat(12),
        date: generatedDate, payerId: "payer", amountCents: Number.MAX_SAFE_INTEGER,
        splitType: "exact", members: [{ personId: "debtor", value: Number.MAX_SAFE_INTEGER }] }],
    };
    const before = structuredClone(group);
    const data = buildReport(group, { sections, generatedDate });
    const pages = readPdf(await renderToBuffer(<ReconcilePdf data={data} />));
    // Literal decimal oracle, independent of formatCents and floating-point dollars.
    expect(tokens(pages).sort()).toEqual([
      ...Array<string>(7).fill("$90071992547409.91"),
      ...Array<string>(2).fill("$-90071992547409.91"), "$0.00", "$0.00",
    ].sort());
    expect(layoutViolations(pages)).toEqual([]);
    expect(group).toEqual(before);
  }, 10000);

  it("keeps NFC duplicate identities distinct in transfers, item assignments and person headings", async () => {
    const group: Group = {
      id: "fictional-r7-nfc", name: "Fictional canonical names",
      people: [{ id: "a", name: "Élodie" }, { id: "b", name: "E\u0301lodie" },
        { id: "reserved", name: "Élodie (1)" }],
      expenses: [{ id: "nfc", description: "Fictional canonical allocation", date: generatedDate,
        payerId: "a", amountCents: 1001, splitType: "equal", members: [], items: [
          { id: "first", name: "Fictional assigned first", amountCents: 600, assigneeIds: ["b"] },
          { id: "second", name: "Fictional assigned second", amountCents: 400, assigneeIds: ["reserved"] },
          { id: "pending", name: "Fictional pending", amountCents: 1, assigneeIds: [] },
        ] }],
    };
    const before = structuredClone(group);
    const pages = readPdf(await renderToBuffer(<ReconcilePdf data={buildReport(group, { sections, generatedDate })} />));
    const text = normalizedText(pages);
    for (const literal of ["Élodie (3) pays Élodie (2)", "Élodie (1) pays Élodie (2)",
      "paid by Élodie (2)", "Fictional assigned first (Élodie (3))", "Fictional assigned second (Élodie (1))",
      "$0.01 pending assignment, excluded from balances."]) expect(text).toContain(literal);
    for (const [label, net] of [["Élodie (1)", "$-4.00"], ["Élodie (2)", "$10.00"], ["Élodie (3)", "$-6.00"]]) {
      // Identify balance/person rows, excluding the same names inside transfer sentences.
      const rows = pages.flatMap((page) => page.objects.filter((object) =>
        object.text.normalize("NFC") === label && page.objects.some((amount) =>
          amount.text === net && Math.abs(amount.baseline - object.baseline) < .5 && amount.left > object.right,
        ),
      ));
      expect(rows, `${label} balance and person rows`).toHaveLength(2);
    }
    expect(layoutViolations(pages)).toEqual([]);
    expect(group).toEqual(before);
  }, 10000);

  it("retains ordered literal description and item text across page wraps beside near-maximum cents", async () => {
    const words = (prefix: string) => Array.from({ length: 144 }, (_, index) => `${prefix}${String(index).padStart(3, "0")}`);
    const descriptionWords = words("FictionalDescR7");
    const itemWords = words("FictionalItemR7");
    const untrusted = '<script>fictional()</script> https://fictional.invalid/r7 /JS (fictional)';
    const description = `${descriptionWords.join(" ")} ${untrusted}`;
    const itemName = `${itemWords.join(" ")} ${"FictionalUnbrokenR7".repeat(8)} ${untrusted}`;
    const group: Group = {
      id: "fictional-r7-wrap", name: "Fictional wrapped report",
      people: [{ id: "a", name: "Fictional wrap payer" }, { id: "b", name: "Fictional wrap debtor" }],
      expenses: [{ id: "wrap", description, date: generatedDate, payerId: "a",
        amountCents: Number.MAX_SAFE_INTEGER, splitType: "equal", members: [], items: [
          { id: "assigned", name: itemName, amountCents: Number.MAX_SAFE_INTEGER - 1, assigneeIds: ["b"] },
          { id: "pending", name: "Fictional pending tail", amountCents: 1, assigneeIds: [] },
        ] }],
    };
    const data = buildReport(group, { sections: { settleUp: false, expenses: true, perPerson: false }, generatedDate });
    const buffer = await renderToBuffer(<ReconcilePdf data={data} />);
    const pages = readPdf(buffer);
    expect(pages.length).toBeGreaterThan(1);
    // Amount siblings can precede a label's next-page continuation in PDF drawing order.
    const body = pages.flatMap((page, index) => page.objects
      .filter((object) => object.text !== `${index + 1} / ${pages.length}`)
      .filter((object) => !/^\$-?\d+\.\d{2}$/.test(object.text))
      .map((object) => object.text.replace(/[-\u00ad]$/, "")));
    const compact = body.join("").normalize("NFC").replace(/\s/g, "");
    expect(compact).toContain(description.replace(/\s/g, ""));
    expect(compact).toContain(itemName.replace(/\s/g, ""));
    const markers = pages.flatMap((page) => page.objects.flatMap((object) =>
      Array.from(object.text.matchAll(/Fictional(?:Desc|Item)R7\d{3}/g), (match) => match[0]),
    ));
    expect(markers).toEqual([...descriptionWords, ...itemWords]);
    expect(tokens(pages).sort()).toEqual(["$90071992547409.91", "$90071992547409.90", "$0.01", "$0.01"].sort());
    expect(buffer.toString("latin1")).not.toMatch(/\/(?:JavaScript|JS|URI|EmbeddedFile|Annots)\b/);
    expect(layoutViolations(pages)).toEqual([]);
    pages.forEach((page, index) => {
      expect(page.objects.filter((object) => object.text === `${index + 1} / ${pages.length}`)).toHaveLength(1);
    });
  }, 10000);
});
