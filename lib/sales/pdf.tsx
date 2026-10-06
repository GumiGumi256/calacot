import React from "react";
import type { DocumentSnapshot } from "./document-model";
/** Node runtime; local embedded branding only. Never fetch caller-supplied asset URLs. */
export async function renderCommercialPdf(d: DocumentSnapshot, draft = false) {
  const {
    Document,
    Page,
    View,
    Text,
    Image,
    StyleSheet,
    renderToBuffer,
    Font,
  } = await import("@react-pdf/renderer");
  Font.register({
    family: "Calacot",
    src: `${process.cwd()}/node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf`,
  });
  const s = StyleSheet.create({
    page: {
      paddingTop: 95,
      paddingHorizontal: 40,
      paddingBottom: 55,
      fontFamily: "Calacot",
      fontSize: 9,
      lineHeight: 1.5,
      color: "#202026",
    },
    header: {
      position: "absolute",
      top: 24,
      left: 40,
      right: 40,
      height: 60,
      borderBottomWidth: 2,
      borderBottomColor: "#ffc919",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    logo: { width: 120, height: 32, objectFit: "contain" },
    meta: { textAlign: "right", fontSize: 9 },
    title: { fontSize: 19, marginBottom: 8 },
    section: { marginVertical: 10 },
    row: {
      flexDirection: "row",
      borderBottomWidth: 0.5,
      borderBottomColor: "#dddddd",
      paddingVertical: 7,
    },
    description: { width: "50%", paddingRight: 8 },
    qty: { width: "10%", paddingRight: 4 },
    price: { width: "18%", textAlign: "right", paddingRight: 6 },
    amount: { width: "22%", textAlign: "right" },
    footer: {
      position: "absolute",
      bottom: 20,
      left: 40,
      right: 40,
      height: 20,
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: 8,
      color: "#666666",
    },
    watermark: {
      position: "absolute",
      top: 350,
      left: 120,
      fontSize: 55,
      color: "#eeeeee",
      transform: "rotate(-30deg)",
    },
  });
  if (d.items.length > 100 || JSON.stringify(d).length > 500000)
    throw new Error("document_size_limit");
  const pdf = (
    <Document title={`${d.type} ${d.number}`} author={d.issuer.legalName}>
      <Page size="A4" style={s.page}>
        <View fixed style={s.header}>
          {/* PDF Image has no HTML alt attribute. */}
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image
            style={s.logo}
            src={`data:image/png;base64,${d.brand.logoBase64}`}
          />
          <View style={s.meta}>
            <Text>
              {d.type.toUpperCase()} {d.number} / R{d.version}
            </Text>
            <Text>Issued {d.issuedAt.slice(0, 10)}</Text>
            <Text>
              {d.type === "quotation" ? "Valid until" : "Due"}{" "}
              {d.due.slice(0, 10)}
            </Text>
          </View>
        </View>
        {draft && (
          <Text fixed style={s.watermark}>
            DRAFT
          </Text>
        )}
        <Text style={s.title}>{d.title}</Text>
        <Text>Project: {d.project}</Text>
        <View style={s.section}>
          <Text>{d.issuer.legalName}</Text>
          <Text>
            {[d.issuer.address, d.issuer.email, d.issuer.phone]
              .filter(Boolean)
              .join(" | ")}
          </Text>
          {d.issuer.taxIdentifier && (
            <Text>Issuer tax identifier: {d.issuer.taxIdentifier}</Text>
          )}
        </View>
        <View style={s.section}>
          <Text>Bill to: {d.customer.name}</Text>
          <Text>{d.customer.address}</Text>
          <Text>{d.customer.email}</Text>
          {d.customer.taxIdentifier && (
            <Text>Customer tax identifier: {d.customer.taxIdentifier}</Text>
          )}
        </View>
        <View style={s.section}>
          <Text>Scope</Text>
          <Text>{d.scope}</Text>
        </View>
        {d.deliverables.length > 0 && (
          <View style={s.section}>
            <Text>Deliverables</Text>
            {d.deliverables.map((v, i) => (
              <Text key={i}>- {v}</Text>
            ))}
          </View>
        )}
        {d.exclusions.length > 0 && (
          <View style={s.section}>
            <Text>Exclusions</Text>
            {d.exclusions.map((v, i) => (
              <Text key={i}>- {v}</Text>
            ))}
          </View>
        )}
        <View fixed style={[s.row, { backgroundColor: "#f5f5f5" }]}>
          <Text style={s.description}>Description / discount / tax</Text>
          <Text style={s.qty}>Qty</Text>
          <Text style={s.price}>Unit price</Text>
          <Text style={s.amount}>Total ({d.currency})</Text>
        </View>
        {d.items.map((line, i) => (
          <View key={i} wrap={false} style={s.row}>
            <View style={s.description}>
              <Text>{line.description}</Text>
              <Text>
                {line.unit} | Discount {line.discountAmount} | Tax{" "}
                {line.taxRate}%
              </Text>
            </View>
            <Text style={s.qty}>{line.quantity}</Text>
            <Text style={s.price}>{line.unitPrice}</Text>
            <Text style={s.amount}>{line.total}</Text>
          </View>
        ))}
        <View style={[s.section, { alignItems: "flex-end" }]} wrap={false}>
          <Text>
            Subtotal: {d.currency} {d.subtotal}
          </Text>
          <Text>
            Discount: {d.currency} {d.discountAmount}
          </Text>
          <Text>
            Tax: {d.currency} {d.taxAmount}
          </Text>
          <Text style={{ fontSize: 14 }}>
            Total: {d.currency} {d.total}
          </Text>
          <Text>
            {d.billingPurpose === "initial"
              ? d.billingPolicy === "deposit"
                ? "Initial deposit per accepted schedule"
                : "Full agreed amount"
              : ""}
          </Text>
        </View>
        <View style={s.section}>
          <Text>Agreed payment schedule</Text>
          {d.schedules.map((stage, i) => (
            <Text key={i}>
              {stage.label}: {d.currency} {stage.amount}
              {stage.dueAt ? ` | ${stage.dueAt.slice(0, 10)}` : ""}
            </Text>
          ))}
        </View>
        <View style={s.section}>
          <Text>Terms</Text>
          <Text>{d.terms}</Text>
        </View>
        {d.instructions && (
          <View style={s.section}>
            <Text>Approved payment instructions</Text>
            <Text>{d.instructions}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
  const bytes = await renderToBuffer(pdf);
  // Installed renderer 4.9.0 drops dynamic footer text. Stamp pagination after
  // layout, without changing the rendered snapshot or introducing another layout engine.
  const {PDFDocument,StandardFonts,rgb}=await import("pdf-lib");
  const output=await PDFDocument.load(bytes);
  const font=await output.embedFont(StandardFonts.Helvetica);
  const pages=output.getPages();
  pages.forEach((page,index)=>{page.drawText(d.number,{x:40,y:20,size:8,font,color:rgb(0.4,0.4,0.4)});const label=`Page ${index+1} of ${pages.length}${draft?" | DRAFT":""}`;page.drawText(label,{x:page.getWidth()-40-font.widthOfTextAtSize(label,8),y:20,size:8,font,color:rgb(0.4,0.4,0.4)});});
  output.setCreationDate(new Date(d.issuedAt));output.setModificationDate(new Date(d.issuedAt));
  return Buffer.from(await output.save());
}
