import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ReportData } from "./report";
import { formatCents } from "../engine/money";

const money = (cents: number): string => `$${formatCents(cents)}`;

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: "#1a1a1a", fontFamily: "Helvetica" },
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
  bold: { fontFamily: "Helvetica-Bold" },
  expenseBlock: { marginBottom: 8 },
});

export function ReconcilePdf({ data }: { data: ReportData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{data.header.groupName}</Text>
        <Text style={styles.subtitle}>
          Generated {data.header.generatedDate}
        </Text>

        {data.settleUp && (
          <View style={styles.section}>
            <Text style={styles.heading}>Settle up</Text>
            {data.settleUp.transfers.length === 0 ? (
              <Text style={styles.muted}>All settled up.</Text>
            ) : (
              data.settleUp.transfers.map((t, i) => (
                <View style={styles.row} key={`t${i}`}>
                  <Text>
                    {t.from} pays {t.to}
                  </Text>
                  <Text>{money(t.cents)}</Text>
                </View>
              ))
            )}
            <View style={{ marginTop: 6 }}>
              {data.settleUp.netBalances.map((b, i) => (
                <View style={styles.row} key={`b${i}`}>
                  <Text style={styles.muted}>{b.name}</Text>
                  <Text style={styles.muted}>{money(b.cents)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {data.expenses && (
          <View style={styles.section}>
            <Text style={styles.heading}>Expenses</Text>
            {data.expenses.map((e, i) => (
              <View style={styles.expenseBlock} key={`e${i}`}>
                <View style={styles.row}>
                  <Text style={styles.bold}>{e.description}</Text>
                  <Text style={styles.bold}>{money(e.amountCents)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.muted}>
                    {e.date} · paid by {e.payerName} · {e.splitSummary}
                  </Text>
                </View>
                {e.items?.map((it, j) => (
                  <View style={styles.itemRow} key={`e${i}i${j}`}>
                    <Text style={styles.muted}>
                      {it.name}
                      {it.assigneeNames.length > 0
                        ? ` (${it.assigneeNames.join(", ")})`
                        : " (pending)"}
                    </Text>
                    <Text style={styles.muted}>{money(it.cents)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {data.perPerson && (
          <View style={styles.section}>
            <Text style={styles.heading}>Per person</Text>
            {data.perPerson.map((p, i) => (
              <View style={styles.expenseBlock} key={`p${i}`}>
                <View style={styles.row}>
                  <Text style={styles.bold}>{p.name}</Text>
                  <Text style={styles.bold}>net {money(p.netCents)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.muted}>
                    paid {money(p.paidCents)} · owed {money(p.owedCents)}
                  </Text>
                </View>
                {p.contributions.map((c, j) => (
                  <View style={styles.itemRow} key={`p${i}c${j}`}>
                    <Text style={styles.muted}>{c.description}</Text>
                    <Text style={styles.muted}>{money(c.owedCents)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}
