import "server-only";
import React from "react";
import { readFile } from "node:fs/promises";

export async function renderPaymentPdf(title: string, lines: string[]) {
  const { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } = await import("@react-pdf/renderer");
  const logo = await readFile(`${process.cwd()}/public/calacot-logo.png`);
  const styles = StyleSheet.create({
    page: { padding: 42, paddingBottom: 65, fontSize: 10, lineHeight: 1.5, color: "#202026" },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 3, borderBottomColor: "#ffc919", paddingBottom: 20, marginBottom: 32 },
    logo: { width: 125, height: 40, objectFit: "contain" },
    headerLabel: { fontSize: 9, color: "#666666", textAlign: "right" },
    title: { fontSize: 25, marginBottom: 6 },
    subtitle: { color: "#666666", marginBottom: 24 },
    row: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.5, borderBottomColor: "#dddddd", paddingVertical: 11 },
    label: { color: "#666666", width: "40%" },
    value: { width: "60%", textAlign: "right" },
    amount: { backgroundColor: "#f5f5f3", paddingHorizontal: 12, borderBottomWidth: 0 },
    note: { marginTop: 22, color: "#666666", fontSize: 9 },
    footer: { position: "absolute", bottom: 28, left: 42, right: 42, borderTopWidth: 1, borderTopColor: "#ffc919", paddingTop: 10, color: "#666666", fontSize: 8 },
  });
  return renderToBuffer(<Document title={title} author="Calacot"><Page size="A4" style={styles.page}>
    <View style={styles.header}>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image style={styles.logo} src={`data:image/png;base64,${logo.toString("base64")}`} />
      <Text style={styles.headerLabel}>CALACOT{"\n"}PAYMENT RECORD</Text>
    </View>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.subtitle}>Thank you for choosing Calacot.</Text>
    <View>{lines.map((line, index) => {
      const separator = line.indexOf(": ");
      if (separator < 0) return <Text key={index} style={styles.note}>{line}</Text>;
      const label = line.slice(0, separator), value = line.slice(separator + 2);
      return <View key={index} style={[styles.row, ...(label === "Amount received" ? [styles.amount] : [])]} wrap={false}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
    })}</View>
    <Text fixed style={styles.footer}>CALACOT  |  Generated {new Date().toISOString().slice(0, 10)}  |  This document reflects the records available when generated.</Text>
  </Page></Document>);
}
