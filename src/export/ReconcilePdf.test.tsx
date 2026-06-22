import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReconcilePdf } from "./ReconcilePdf";
import type { ReportData } from "./report";

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
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("renders when optional sections are omitted", async () => {
    const buffer = await renderToBuffer(
      <ReconcilePdf data={{ header: sample.header }} />,
    );
    expect(buffer.length).toBeGreaterThan(0);
  });
});
