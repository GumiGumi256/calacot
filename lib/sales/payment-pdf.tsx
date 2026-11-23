import "server-only";
import React from "react";

export async function renderPaymentPdf(title: string, lines: string[]) {
  const { Document, Page, Text, View, StyleSheet, renderToBuffer } = await import("@react-pdf/renderer");
  const styles = StyleSheet.create({ page: { padding: 45, fontSize: 10, lineHeight: 1.6 }, title: { fontSize: 20, marginBottom: 18 }, line: { paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: "#dddddd" }, footer: { marginTop: 22, color: "#666666", fontSize: 8 } });
  return renderToBuffer(<Document title={title} author="Calacot"><Page size="A4" style={styles.page}><Text style={styles.title}>{title}</Text><View>{lines.map((line, index) => <Text key={index} style={styles.line}>{line}</Text>)}</View><Text style={styles.footer}>Generated {new Date().toISOString().slice(0, 10)}. This document reflects the records available when generated.</Text></Page></Document>);
}
