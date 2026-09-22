import "server-only";

import { after } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/database/db";
import {
  designPurchases,
  type DesignPurchaseRecord,
} from "@/database/schema";

import { getEmailClient } from "@/lib/email/client";
import { escapeHtml } from "@/lib/email/template";
import {
  purchaseUrl,
  purchaseWhatsAppUrl,
} from "@/lib/company";

import { formatAmount } from "./model";

const SITE_URL = "https://www.calacot.com";

const LOGO_BLACK = `${SITE_URL}/calacot-logo-vertical-black.png`;
const LOGO_WHITE = `${SITE_URL}/calacot-logo-vertical-white.png`;

export function queueDesignEmail(
  purchase: DesignPurchaseRecord,
  kind: "invoice" | "confirmed",
) {
  after(() => deliverDesignEmail(purchase, kind));
}

export async function deliverDesignEmail(
  p: DesignPurchaseRecord,
  kind: "invoice" | "confirmed",
) {
  if (
    kind === "invoice"
      ? p.invoiceEmailSentAt
      : p.confirmationEmailSentAt
  ) {
    return;
  }

  try {
    const email = getEmailClient();

    if (!email) {
      throw new Error("Email configuration unavailable");
    }

    const confirmed = kind === "confirmed";

    const heading = confirmed
      ? "Payment confirmed"
      : "Your design request is confirmed";

    const next = confirmed
      ? "Your payment is confirmed and access is active. The Calacot team will make your design documents available through your account."
      : "Your purchase request has been received. Your proforma invoice is attached. You can pay directly using the instructions in your account or complete your purchase with Calacot via WhatsApp.";

    const url = purchaseUrl(p.id);
    const whatsapp = purchaseWhatsAppUrl(p);

    const rows = [
      ["Design", p.designTitle],
      ["Package", p.packageName],
      ["Amount", formatAmount(p.amount, p.currency)],
      ["Purchase reference", p.purchaseReference],
      ["Invoice number", p.invoiceNumber],
    ];

    const detailsHtml = rows
      .map(
        ([label, value]) => `
          <tr>
            <td
              style="
                padding:14px 0;
                border-bottom:1px solid #e8e8e3;
                vertical-align:top;
              "
            >
              <div
                style="
                  margin-bottom:4px;
                  font-size:11px;
                  line-height:1.4;
                  letter-spacing:0.8px;
                  text-transform:uppercase;
                  color:#77777f;
                "
              >
                ${escapeHtml(label)}
              </div>

              <div
                style="
                  font-size:15px;
                  line-height:1.5;
                  font-weight:600;
                  color:#202026;
                "
              >
                ${escapeHtml(value)}
              </div>
            </td>
          </tr>
        `,
      )
      .join("");

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1"
          />

          <meta
            name="color-scheme"
            content="light dark"
          />

          <meta
            name="supported-color-schemes"
            content="light dark"
          />

          <style>
            :root {
              color-scheme: light dark;
              supported-color-schemes: light dark;
            }

            .dark-logo {
              display: none !important;
            }

            @media (prefers-color-scheme: dark) {
              .email-body {
                background-color: #14141a !important;
              }

              .email-card {
                background-color: #202026 !important;
              }

              .email-heading,
              .email-primary-text,
              .detail-value {
                color: #f5f6fc !important;
              }

              .email-muted,
              .detail-label {
                color: #a8a8ae !important;
              }

              .detail-row {
                border-color: #36363d !important;
              }

              .light-logo {
                display: none !important;
              }

              .dark-logo {
                display: block !important;
              }

              .footer-border {
                border-color: #36363d !important;
              }
            }
          </style>
        </head>

        <body
          class="email-body"
          style="
            margin:0;
            padding:0;
            background:#f4f4f0;
            font-family:Arial,Helvetica,sans-serif;
            color:#202026;
          "
        >
          <div
            style="
              display:none;
              max-height:0;
              overflow:hidden;
              opacity:0;
            "
          >
            ${
              confirmed
                ? "Your Calacot Architecture payment has been confirmed."
                : `Your Calacot Architecture proforma invoice ${escapeHtml(
                    p.invoiceNumber,
                  )} is ready.`
            }
          </div>

          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            border="0"
          >
            <tr>
              <td
                align="center"
                style="padding:32px 16px;"
              >
                <table
                  role="presentation"
                  width="100%"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                  class="email-card"
                  style="
                    width:100%;
                    max-width:620px;
                    background:#ffffff;
                  "
                >
                  <!-- Brand -->
                  <tr>
                    <td
                      style="
                        padding:38px 38px 24px;
                      "
                    >
                      <img
                        src="${LOGO_BLACK}"
                        alt="Calacot"
                        width="100"
                        class="light-logo"
                        style="
                          display:block;
                          width:100px;
                          max-width:100px;
                          height:auto;
                          border:0;
                        "
                      />

                      <img
                        src="${LOGO_WHITE}"
                        alt="Calacot"
                        width="100"
                        class="dark-logo"
                        style="
                          display:none;
                          width:100px;
                          max-width:100px;
                          height:auto;
                          border:0;
                        "
                      />
                    </td>
                  </tr>

                  <!-- Accent -->
                  <tr>
                    <td style="padding:0 38px;">
                      <div
                        style="
                          height:2px;
                          background:#ffc919;
                          width:100%;
                        "
                      ></div>
                    </td>
                  </tr>

                  <!-- Heading -->
                  <tr>
                    <td
                      style="
                        padding:30px 38px 16px;
                      "
                    >
                      <div
                        class="email-muted"
                        style="
                          margin-bottom:10px;
                          font-size:11px;
                          line-height:1.4;
                          letter-spacing:1.4px;
                          text-transform:uppercase;
                          color:#77777f;
                        "
                      >
                        Calacot Architecture
                      </div>

                      <h1
                        class="email-heading"
                        style="
                          margin:0;
                          max-width:460px;
                          font-size:30px;
                          line-height:1.2;
                          font-weight:500;
                          letter-spacing:-0.5px;
                          color:#202026;
                        "
                      >
                        ${escapeHtml(heading)}
                      </h1>
                    </td>
                  </tr>

                  <!-- Message -->
                  <tr>
                    <td
                      style="
                        padding:0 38px 28px;
                      "
                    >
                      <p
                        class="email-primary-text"
                        style="
                          margin:0;
                          max-width:520px;
                          font-size:15px;
                          line-height:1.75;
                          color:#202026;
                        "
                      >
                        ${escapeHtml(next)}
                      </p>
                    </td>
                  </tr>

                  <!-- Purchase details -->
                  <tr>
                    <td
                      style="
                        padding:0 38px 30px;
                      "
                    >
                      <div
                        class="email-muted"
                        style="
                          margin-bottom:6px;
                          font-size:11px;
                          line-height:1.4;
                          letter-spacing:1.2px;
                          text-transform:uppercase;
                          color:#77777f;
                        "
                      >
                        Purchase details
                      </div>

                      <table
                        role="presentation"
                        width="100%"
                        cellspacing="0"
                        cellpadding="0"
                        border="0"
                      >
                        ${detailsHtml}
                      </table>
                    </td>
                  </tr>

                  <!-- CTA -->
                  <tr>
                    <td
                      style="
                        padding:0 38px 20px;
                      "
                    >
                      <a
                        href="${escapeHtml(url)}"
                        style="
                          display:inline-block;
                          padding:15px 22px;
                          background:#ffc919;
                          color:#202026;
                          font-size:14px;
                          font-weight:600;
                          line-height:1;
                          text-decoration:none;
                        "
                      >
                        View your purchase
                      </a>
                    </td>
                  </tr>

                  ${
                    !confirmed && whatsapp
                      ? `
                        <tr>
                          <td
                            style="
                              padding:0 38px 34px;
                            "
                          >
                            <a
                              href="${escapeHtml(whatsapp)}"
                              class="email-primary-text"
                              style="
                                font-size:13px;
                                line-height:1.5;
                                color:#202026;
                                text-decoration:underline;
                                text-underline-offset:3px;
                              "
                            >
                              Complete purchase on WhatsApp
                            </a>
                          </td>
                        </tr>
                      `
                      : `
                        <tr>
                          <td style="height:14px;"></td>
                        </tr>
                      `
                  }

                  <!-- Footer -->
                  <tr>
                    <td
                      class="footer-border"
                      style="
                        margin-top:10px;
                        padding:22px 38px 30px;
                        border-top:1px solid #e8e8e3;
                      "
                    >
                      <table
                        role="presentation"
                        width="100%"
                        cellspacing="0"
                        cellpadding="0"
                        border="0"
                      >
                        <tr>
                          <td
                            class="email-muted"
                            style="
                              font-size:11px;
                              line-height:1.6;
                              color:#888890;
                            "
                          >
                            Calacot Architecture<br />
                            Possibility, designed.
                          </td>

                          <td
                            align="right"
                            class="email-muted"
                            style="
                              font-size:11px;
                              line-height:1.6;
                              color:#888890;
                            "
                          >
                            ${escapeHtml(p.invoiceNumber)}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const attachments = confirmed
      ? undefined
      : [
          {
            filename: `${p.invoiceNumber}.pdf`,
            content: await (
              await import("./invoice")
            ).generateDesignInvoice(p),
          },
        ];

    const payload = {
      from: email.from,
      to: p.customerEmail,

      subject: confirmed
        ? "Payment confirmed - Your Calacot design"
        : `Your Calacot design invoice - ${p.invoiceNumber}`,

      html,

      text: `${heading}

${next}

${rows.map(([key, value]) => `${key}: ${value}`).join("\n")}

${url}`,

      attachments,
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await email.client.emails.send(payload, {
          idempotencyKey: `design-${kind}/${p.id}`,
        });

        if (result.error || !result.data?.id) {
          throw new Error(
            result.error?.name || "Missing email response",
          );
        }

        await db
          .update(designPurchases)
          .set(
            kind === "invoice"
              ? { invoiceEmailSentAt: new Date() }
              : { confirmationEmailSentAt: new Date() },
          )
          .where(eq(designPurchases.id, p.id));

        return;
      } catch {
        if (attempt === 2) {
          throw new Error(
            "Email delivery failed after retries",
          );
        }

        await new Promise((resolve) =>
          setTimeout(resolve, 500 * 2 ** attempt),
        );
      }
    }
  } catch (error) {
    console.error(
      "Design purchase email/PDF failed; purchase remains saved",
      {
        purchaseId: p.id,
        kind,
        reason:
          error instanceof Error
            ? error.message
            : "Unknown failure",
      },
    );
  }
}