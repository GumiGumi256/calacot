import React from "react";
import type { DesignPurchaseRecord } from "@/database/schema";
import { formatAmount, formatDate } from "./model";

export async function generateDesignInvoice(purchase: DesignPurchaseRecord) {
  const {
    Document,
    Page,
    Text,
    View,
    Image,
    StyleSheet,
    renderToBuffer,
  } = await import("@react-pdf/renderer");

  const logoPath = `${process.cwd()}/public/calacot-logo-vertical-black.svg`;

  const styles = StyleSheet.create({
    page: {
      paddingTop: 42,
      paddingHorizontal: 46,
      paddingBottom: 70,
      fontFamily: "Helvetica",
      fontSize: 10,
      lineHeight: 1.5,
      color: "#202026",
      backgroundColor: "#fdfdfb",
    },

    header: {
      marginBottom: 32,
    },

    headerTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 22,
    },

    logo: {
      width: 125,
      height: 32,
      objectFit: "contain",
    },

    invoiceMeta: {
      alignItems: "flex-end",
    },

    invoiceLabel: {
      fontSize: 8,
      color: "#77777f",
      letterSpacing: 1.5,
      marginBottom: 4,
    },

    invoiceNumber: {
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      marginBottom: 3,
    },

    issuedDate: {
      fontSize: 8.5,
      color: "#77777f",
    },

    divider: {
      height: 2,
      backgroundColor: "#ffc919",
      width: "100%",
    },

    titleRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      marginTop: 24,
    },

    title: {
      fontSize: 26,
      lineHeight: 1.2,
      fontFamily: "Helvetica-Bold",
      letterSpacing: -0.5,
    },

    architecture: {
      fontSize: 9,
      color: "#77777f",
    },

    detailsGrid: {
      flexDirection: "row",
      gap: 30,
      marginBottom: 28,
    },

    detailColumn: {
      flex: 1,
    },

    section: {
      marginBottom: 22,
    },

    heading: {
      fontSize: 8,
      fontFamily: "Helvetica-Bold",
      letterSpacing: 1.2,
      color: "#77777f",
      marginBottom: 8,
    },

    primaryText: {
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      marginBottom: 3,
    },

    muted: {
      color: "#77777f",
      fontSize: 9,
    },

    packageBox: {
      paddingTop: 16,
      paddingBottom: 16,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: "#ddddda",
      marginBottom: 24,
    },

    packageItem: {
      flexDirection: "row",
      marginBottom: 7,
    },

    bullet: {
      width: 14,
      color: "#ffc919",
      fontFamily: "Helvetica-Bold",
    },

    packageItemText: {
      flex: 1,
      fontSize: 9.5,
    },

    total: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 18,
      paddingHorizontal: 20,
      backgroundColor: "#f3f2ed",
      borderLeftWidth: 3,
      borderLeftColor: "#ffc919",
      marginBottom: 24,
    },

    totalLabel: {
      fontSize: 8,
      color: "#77777f",
      letterSpacing: 1.2,
    },

    amount: {
      fontSize: 22,
      fontFamily: "Helvetica-Bold",
    },

    referenceSection: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 20,
      marginBottom: 24,
    },

    referenceBlock: {
      flex: 1,
    },

    referenceValue: {
      fontSize: 9.5,
      fontFamily: "Helvetica-Bold",
    },

    note: {
      fontSize: 8.5,
      lineHeight: 1.6,
      color: "#77777f",
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: "#e5e5e2",
    },

    footer: {
      position: "absolute",
      bottom: 26,
      left: 46,
      right: 46,
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: 7.5,
      color: "#8a8a91",
      borderTopWidth: 1,
      borderTopColor: "#e5e5e2",
      paddingTop: 10,
    },
  });

  function getPaymentStatus(p: DesignPurchaseRecord) {
    if (p.purchaseStatus === "cancelled") return "Cancelled";
    if (p.paymentStatus === "confirmed") return "Confirmed";
    if (p.paymentStatus === "submitted") return "Under review";
    return "Awaiting payment";
  }

  function DesignInvoice({
    purchase: p,
  }: {
    purchase: DesignPurchaseRecord;
  }) {
    return (
      <Document
        title={`Proforma invoice ${p.invoiceNumber}`}
        author="Calacot Architecture"
      >
        <Page size="A4" style={styles.page} wrap>
          {/* Header */}
          <View style={styles.header} wrap={false}>
            <View style={styles.headerTop}>
              <Image src={logoPath} style={styles.logo} />

              <View style={styles.invoiceMeta}>
                <Text style={styles.invoiceLabel}>INVOICE NUMBER</Text>
                <Text style={styles.invoiceNumber}>{p.invoiceNumber}</Text>
                <Text style={styles.issuedDate}>
                  Issued {formatDate(p.invoiceIssuedAt)}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.titleRow}>
              <Text style={styles.title}>Proforma Invoice</Text>
              <Text style={styles.architecture}>CALACOT ARCHITECTURE</Text>
            </View>
          </View>

          {/* Customer + Design */}
          <View style={styles.detailsGrid} wrap={false}>
            <View style={styles.detailColumn}>
              <Text style={styles.heading}>BILL TO</Text>

              <Text style={styles.primaryText}>{p.customerName}</Text>
              <Text>{p.customerEmail}</Text>
              <Text>{p.customerPhone}</Text>
            </View>

            <View style={styles.detailColumn}>
              <Text style={styles.heading}>DESIGN</Text>

              <Text style={styles.primaryText}>{p.designTitle}</Text>

              {p.designCode && (
                <Text style={styles.muted}>{p.designCode}</Text>
              )}
            </View>
          </View>

          {/* Package */}
          <View style={styles.section} wrap={false}>
            <Text style={styles.heading}>SELECTED PACKAGE</Text>

            <Text style={styles.primaryText}>{p.packageName}</Text>

            {p.packageDescription && (
              <Text style={styles.muted}>{p.packageDescription}</Text>
            )}
          </View>

          {/* Package contents */}
          <View style={styles.packageBox}>
            <Text style={styles.heading} minPresenceAhead={35}>
              PACKAGE INCLUDES
            </Text>

            {p.packageIncludes.map((item, index) => (
              <View key={index} style={styles.packageItem} wrap={false}>
                <Text style={styles.bullet}>—</Text>
                <Text style={styles.packageItemText}>{item}</Text>
              </View>
            ))}
          </View>

          {/* Total */}
          <View style={styles.total} wrap={false}>
            <View>
              <Text style={styles.totalLabel}>TOTAL AMOUNT</Text>
            </View>

            <Text style={styles.amount}>
              {formatAmount(p.amount, p.currency)}
            </Text>
          </View>

          {/* Reference + status */}
          <View style={styles.referenceSection} wrap={false}>
            <View style={styles.referenceBlock}>
              <Text style={styles.heading}>PURCHASE REFERENCE</Text>
              <Text style={styles.referenceValue}>
                {p.purchaseReference}
              </Text>
            </View>

            <View style={styles.referenceBlock}>
              <Text style={styles.heading}>PAYMENT STATUS</Text>
              <Text style={styles.referenceValue}>
                {getPaymentStatus(p)}
              </Text>
            </View>
          </View>

          {/* Note */}
          <Text style={styles.note}>
            This proforma invoice relates to the selected architectural design
            package. Additional services, site adaptation, statutory approvals,
            engineering services and other professional services are separate
            unless explicitly included in the selected package.
          </Text>

          {/* Footer */}
          <View fixed style={styles.footer}>
            <Text>Calacot Architecture</Text>
            <Text>{p.invoiceNumber}</Text>
          </View>
        </Page>
      </Document>
    );
  }

  return renderToBuffer(<DesignInvoice purchase={purchase} />);
}