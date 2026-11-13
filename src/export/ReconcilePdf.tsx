import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { ReportData } from "./report";
import { formatCents } from "../engine/money";
import fontLicense from "./fonts/LICENSE?raw";

// Bundled fonts keep export offline and preserve Latin, Greek and Cyrillic names.
const fontSource = (url: URL) => {
  return url.protocol === "file:" ? decodeURIComponent(url.pathname) : url.href;
};
Font.register({ family: "ReportSans", fonts: [
  { src: fontSource(new URL("./fonts/DejaVuSans.ttf", import.meta.url)) },
  { src: fontSource(new URL("./fonts/DejaVuSans-Bold.ttf", import.meta.url)), fontWeight: 700 },
] });
Font.registerHyphenationCallback((word) => {
  const letters = Array.from(word);
  if (letters.length <= 24) return [word];
  const parts: string[] = [];
  for (let i = 0; i < letters.length; i += 24) parts.push(letters.slice(i, i + 24).join(""));
  return parts;
});

const money = (cents: number): string => `$${formatCents(cents)}`;

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: "#1a1a1a", fontFamily: "ReportSans" },
  title: { fontSize: 20, marginBottom: 2 },
  subtitle: { fontSize: 10, color: "#666", marginBottom: 16 },
  section: { marginBottom: 18 },
  heading: {
    fontSize: 13,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    paddingBottom: 3,
  },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 1,
    paddingLeft: 12,
  },
  muted: { color: "#777" },
  bold: { fontWeight: 700 },
  expenseBlock: { marginBottom: 8 },
  // Size View columns before measuring Text; react-pdf caches its first text layout.
  label: { flexBasis: 0, flexGrow: 1, flexShrink: 1, minWidth: 0, paddingRight: 12 },
  // At 10pt, DejaVu Sans Bold needs 146.9pt for net $-90071992547409.91.
  amount: { flexShrink: 0, width: 150, textAlign: "right" },
  metadata: { width: "100%", paddingRight: 12 },
  footer: { position: "absolute", bottom: 18, left: 36, right: 36, fontSize: 8, color: "#666", textAlign: "right" },
});

export function ReconcilePdf({ data }: { data: ReportData }) {
  return (
    <Document subject={`Embedded DejaVu font license\n${fontLicense}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{data.header.groupName}</Text>
        <Text style={styles.subtitle}>
          Generated {data.header.generatedDate}
        </Text>

        {data.settleUp && (
          <>
            <Text style={styles.heading} minPresenceAhead={100}>Settle up</Text>
            <View style={styles.section}>
              {data.settleUp.transfers.length === 0 ? (
                <Text style={styles.muted}>All settled up.</Text>
              ) : (
                data.settleUp.transfers.map((t, i) => (
                  <View style={styles.row} key={`t${i}`}>
                    <View style={styles.label}>
                      <Text>{t.from} pays {t.to}</Text>
                    </View>
                    <View style={styles.amount}>
                      <Text>{money(t.cents)}</Text>
                    </View>
                  </View>
                ))
              )}
              <View style={{ marginTop: 6 }}>
                {data.settleUp.netBalances.map((b, i) => (
                  <View style={styles.row} key={`b${i}`}>
                    <View style={styles.label}>
                      <Text style={styles.muted}>{b.name}</Text>
                    </View>
                    <View style={styles.amount}>
                      <Text style={styles.muted}>{money(b.cents)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {data.expenses && (
          <>
            <Text style={styles.heading} minPresenceAhead={100}>Expenses</Text>
            <View style={styles.section}>
              {data.expenses.map((e, i) => (
                <View style={styles.expenseBlock} key={`e${i}`}>
                  <View style={styles.row} minPresenceAhead={60}>
                    <View style={styles.label}>
                      <Text style={styles.bold}>{e.description}</Text>
                    </View>
                    <View style={styles.amount}>
                      <Text style={styles.bold}>{money(e.amountCents)}</Text>
                    </View>
                  </View>
                  <View style={styles.row}>
                    <Text style={[styles.muted, styles.metadata]}>
                      {e.date} · paid by {e.payerName} · {e.splitSummary}
                    </Text>
                  </View>
                  {Boolean(e.pendingCents) && (
                    <Text style={styles.muted}>{money(e.pendingCents!)} pending assignment, excluded from balances.</Text>
                  )}
                  {e.items?.map((it, j) => (
                    <View style={styles.itemRow} key={`e${i}i${j}`}>
                      <View style={styles.label}>
                        <Text style={styles.muted}>
                          {it.name}
                          {it.assigneeNames.length > 0
                            ? ` (${it.assigneeNames.join(", ")})`
                            : " (pending)"}
                        </Text>
                      </View>
                      <View style={styles.amount}>
                        <Text style={styles.muted}>{money(it.cents)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </>
        )}

        {data.perPerson && (
          <>
            <Text style={styles.heading} minPresenceAhead={100}>Per person</Text>
            <View style={styles.section}>
              {data.perPerson.map((p, i) => (
                <View style={styles.expenseBlock} key={`p${i}`}>
                  <View style={styles.row} minPresenceAhead={60}>
                    <View style={styles.label}>
                      <Text style={styles.bold}>{p.name}</Text>
                    </View>
                    <View style={styles.amount}>
                      <Text style={styles.bold}>net {money(p.netCents)}</Text>
                    </View>
                  </View>
                  <View style={styles.row}>
                    <Text style={[styles.muted, styles.metadata]}>
                      paid {money(p.paidCents)} · owed {money(p.owedCents)}
                    </Text>
                  </View>
                  {p.contributions.map((c, j) => (
                    <View style={styles.itemRow} key={`p${i}c${j}`}>
                      <View style={styles.label}>
                        <Text style={styles.muted}>{c.description}</Text>
                      </View>
                      <View style={styles.amount}>
                        <Text style={styles.muted}>{money(c.owedCents)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </>
        )}
        <Text fixed style={styles.footer} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </Page>
    </Document>
  );
}
