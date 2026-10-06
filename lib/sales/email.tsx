import React from "react";
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Heading,
  Text,
  Link,
  Hr,
  render,
} from "react-email";
import type { DocumentSnapshot } from "./document-model";
export function QuotationEmail({
  d,
  url,
}: {
  d: DocumentSnapshot;
  url: string;
}) {
  return (
    <CommercialEmail
      d={d}
      url={url}
      message="Please review the attached quotation and its terms. Contact us to discuss or provide acceptance. Delivery of this email does not confirm acceptance."
    />
  );
}
export function InvoiceEmail({ d, url }: { d: DocumentSnapshot; url: string }) {
  return (
    <CommercialEmail
      d={d}
      url={url}
      message={`Your project agreement is confirmed. This invoice covers ${d.billingPolicy === "deposit" ? "the initial deposit per your agreed schedule" : "the full agreed amount"}. Payment remains due; confirmation does not indicate payment receipt or that work has begun.`}
    />
  );
}
function CommercialEmail({
  d,
  url,
  message,
}: {
  d: DocumentSnapshot;
  url: string;
  message: string;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>
        {d.type} {d.number} · {d.currency} {d.total}
      </Preview>
      <Body
        style={{
          backgroundColor: "#f5f5f3",
          fontFamily: "Arial,sans-serif",
          color: "#202026",
        }}
      >
        <Container
          style={{
            backgroundColor: "#ffffff",
            padding: "32px",
            maxWidth: "600px",
          }}
        >
          <Text style={{ fontSize: 22 }}>CALACOT</Text>
          <Hr style={{ borderColor: "#ffc919" }} />
          <Heading>
            {d.type === "quotation" ? "Your quotation" : "Your project invoice"}
          </Heading>
          <Text>Hello {d.customer.name},</Text>
          <Text>{message}</Text>
          <Text>
            {d.number} / R{d.version}
            <br />
            Project: {d.project}
            <br />
            Amount: {d.currency} {d.total}
            <br />
            {d.type === "quotation" ? "Valid until" : "Due"}:{" "}
            {d.due.slice(0, 10)}
          </Text>
          <Link href={url}>Download your private document</Link>
          <Text>
            The download link expires after 30 days. Contact us for a
            replacement if needed.
          </Text>
          <Text>
            {d.issuer.legalName}
            <br />
            {d.issuer.email}
            <br />
            {d.issuer.phone}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
export async function emailContent(d: DocumentSnapshot, url: string) {
  const element =
    d.type === "quotation" ? (
      <QuotationEmail d={d} url={url} />
    ) : (
      <InvoiceEmail d={d} url={url} />
    );
  return {
    subject: `Calacot ${d.type} ${d.number} — ${d.project}`,
    html: await render(element),
    text: await render(element, { plainText: true }),
  };
}
