import React from "react";
import type { DesignPurchaseRecord } from "@/database/schema";
import { formatAmount, formatDate } from "./model";

export async function generateDesignInvoice(purchase: DesignPurchaseRecord) {
  const { Document, Page, Text, View, StyleSheet, renderToBuffer } =
    await import("@react-pdf/renderer");
  const styles = StyleSheet.create({
    page: {
      padding: 42,
      paddingBottom: 65,
      fontFamily: "Helvetica",
      fontSize: 10,
      lineHeight: 1.4,
      color: "#202026",
      backgroundColor: "#fdfdfb",
    },
    header: {
      backgroundColor: "#202026",
      padding: 20,
      marginBottom: 20,
      color: "#ffffff",
      borderTopWidth: 5,
      borderTopColor: "#ffc919",
    },
    brand: {
      fontSize: 25,
      lineHeight: 1.3,
      marginBottom: 6,
      letterSpacing: 4,
      color: "#ffc919",
      fontFamily: "Helvetica-Bold",
    },
    title: { fontSize: 20, lineHeight: 1.3, marginTop: 14, marginBottom: 8 },
    muted: { color: "#62626b", fontSize: 9 },
    section: { marginBottom: 16 },
    heading: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 7 },
    total: {
      padding: 18,
      backgroundColor: "#f0efe9",
      borderLeftWidth: 3,
      borderLeftColor: "#ffc919",
      marginBottom: 22,
    },
    footer: {
      position: "absolute",
      bottom: 25,
      left: 42,
      right: 42,
      height: 14,
      fontSize: 8,
      lineHeight: 1.2,
      color: "#62626b",
    },
  });

  function DesignInvoice({ purchase: p }: { purchase: DesignPurchaseRecord }) {
    return (
      <Document
        title={`Proforma invoice ${p.invoiceNumber}`}
        author="Calacot Architecture"
      >
        <Page size="A4" style={styles.page} wrap>
          <View style={styles.header} wrap={false}>
            <Text style={styles.brand}>CALACOT</Text>
            <Text>Architecture</Text>
            <Text style={styles.title}>PROFORMA INVOICE</Text>
            <Text>{p.invoiceNumber}</Text>
            <Text>Issued {formatDate(p.invoiceIssuedAt)}</Text>
          </View>
          <View style={styles.section} wrap={false}>
            <Text style={styles.heading}>BILL TO</Text>
            <Text>{p.customerName}</Text>
            <Text>{p.customerEmail}</Text>
            <Text>{p.customerPhone}</Text>
          </View>
          <View style={styles.section} wrap={false}>
            <Text style={styles.heading}>DESIGN</Text>
            <Text>{p.designTitle}</Text>
            {p.designCode && <Text style={styles.muted}>{p.designCode}</Text>}
            <Text style={[styles.heading, { marginTop: 14 }]}>PACKAGE</Text>
            <Text>{p.packageName}</Text>
            {p.packageDescription && (
              <Text style={styles.muted}>{p.packageDescription}</Text>
            )}
          </View>
          <View style={styles.section}>
            <Text style={styles.heading} minPresenceAhead={35}>
              PACKAGE INCLUDES
            </Text>
            {p.packageIncludes.map((item, index) => (
              <Text key={index} style={{ marginBottom: 5 }}>
                - {item}
              </Text>
            ))}
          </View>
          <View style={styles.total} wrap={false}>
            <Text style={styles.muted}>TOTAL AMOUNT</Text>
            <Text style={{ fontSize: 24, lineHeight: 1.3, marginTop: 5 }}>
              {formatAmount(p.amount, p.currency)}
            </Text>
          </View>
          <View style={styles.section} wrap={false}>
            <Text>Purchase reference: {p.purchaseReference}</Text>
            <Text>
              Payment status:{" "}
              {p.purchaseStatus === "cancelled"
                ? "Cancelled"
                : p.paymentStatus === "confirmed"
                  ? "Confirmed"
                  : p.paymentStatus === "submitted"
                    ? "Under review"
                    : "Awaiting payment"}
            </Text>
          </View>
          <Text style={styles.muted}>
            This proforma invoice relates to the selected architectural design
            package. Additional services, site adaptation, approvals and other
            professional services are separate unless explicitly included.
          </Text>
          <Text fixed style={styles.footer}>
            CALACOT Architecture | {p.invoiceNumber}
          </Text>
        </Page>
      </Document>
    );
  }

  return renderToBuffer(<DesignInvoice purchase={purchase} />);
}
