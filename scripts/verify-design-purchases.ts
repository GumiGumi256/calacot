import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import { designPurchases } from "../database/schema";
import {
  canAccessDesign,
  formatAmount,
  purchaseSchema,
  paymentSchema,
} from "../lib/design-purchases/model";
import {
  ownedPurchaseFilter,
  paymentSubmissionFilter,
  reviewFilter,
  reviewChanges,
} from "../lib/design-purchases/transitions";
import { createPurchaseReferences } from "../lib/design-purchases/references";
import { generateDesignInvoice } from "../lib/design-purchases/invoice";

async function main() {
  const pg = new PGlite();
  const db = drizzle(pg);
  try {
    await pg.exec(await readFile("drizzle/0003_many_goliath.sql", "utf8"));
    // Verify upgrading a populated database, not just an empty schema.
    const legacyId = randomUUID();
    await pg.query(
      `INSERT INTO design_purchases (id, clerk_user_id, customer_name, customer_email, customer_phone, sanity_design_id, design_slug, design_title, sanity_package_id, package_name, package_includes, amount, created_at) VALUES ($1, 'legacy', 'Legacy customer', 'legacy@example.com', '+256700000001', 'legacy-design', 'legacy', 'Original design', 'legacy-package', 'Original package', '["Original deliverable"]', '1250000', '2025-01-10T12:00:00Z')`,
      [legacyId],
    );
    await pg.exec(
      await readFile("drizzle/0004_supreme_martin_li.sql", "utf8"),
    );
    await pg.exec(
      await readFile("drizzle/0005_whatsapp_purchase_notifications.sql", "utf8"),
    );
    const [legacy] = await db
      .select()
      .from(designPurchases)
      .where(eq(designPurchases.id, legacyId));
    assert.equal(legacy.purchaseStatus, "awaiting_payment");
    assert.match(legacy.invoiceNumber, /^CAL-INV-2025-/);
    assert.equal(
      legacy.invoiceIssuedAt.toISOString(),
      legacy.createdAt.toISOString(),
    );
    assert.equal(legacy.amount, "1250000.00");
    assert.deepEqual(legacy.packageIncludes, ["Original deliverable"]);

    const values = {
      clerkUserId: "owner",
      customerName: "Sample Customer",
      customerEmail: "customer@example.com",
      customerPhone: "+256700000001",
      sanityDesignId: "design",
      designSlug: "sample-residence",
      designTitle: "The Sample Residence",
      sanityPackageId: "package",
      packageName: "Architectural Package",
      packageDescription:
        "A considered set of architectural drawings for your new home.",
      packageIncludes: [
        "Floor plans",
        "Elevations and sections",
        "Roof layout",
        "Door and window schedule",
      ],
      amount: "1500000.00",
      ...createPurchaseReferences(),
    };
    const [p] = await db.insert(designPurchases).values(values).returning();
    assert.equal(p.purchaseStatus, "awaiting_payment");
    assert.equal(canAccessDesign(p), false);
    assert.equal(
      (
        await db
          .select()
          .from(designPurchases)
          .where(ownedPurchaseFilter(p.id, "intruder"))
      ).length,
      0,
      "Another customer cannot read this purchase or invoice",
    );
    assert.equal(
      (
        await db
          .select()
          .from(designPurchases)
          .where(ownedPurchaseFilter(p.id, "owner"))
      ).length,
      1,
    );

    const duplicates = await Promise.all(
      Array.from({ length: 5 }, () =>
        db
          .insert(designPurchases)
          .values({ ...values, ...createPurchaseReferences() })
          .onConflictDoNothing()
          .returning(),
      ),
    );
    assert(
      duplicates.every((rows) => rows.length === 0),
      "Concurrent submissions must not create duplicate open purchases",
    );
    await assert.rejects(
      db
        .update(designPurchases)
        .set({ accessStatus: "active" })
        .where(eq(designPurchases.id, p.id)),
      "Unconfirmed access must be rejected by the database",
    );
    await assert.rejects(
      db
        .insert(designPurchases)
        .values({
          ...values,
          sanityDesignId: "negative",
          amount: "-1",
          ...createPurchaseReferences(),
        }),
    );
    assert.equal(
      (
        await db
          .update(designPurchases)
          .set({ paymentReference: "STOLEN" })
          .where(paymentSubmissionFilter(p.id, "intruder"))
          .returning()
      ).length,
      0,
      "Ownership is enforced in the write itself",
    );

    async function submit(reference: string) {
      return db
        .update(designPurchases)
        .set({
          purchaseStatus: "payment_submitted",
          paymentStatus: "submitted",
          paymentMethod: "mobile_money",
          paymentReference: reference,
          paymentSubmittedAt: new Date(),
          revision: sql`${designPurchases.revision} + 1`,
        })
        .where(paymentSubmissionFilter(p.id, "owner"))
        .returning();
    }
    const [submitted] = await submit("FIRST-REFERENCE");
    assert.equal(submitted.paymentStatus, "submitted");
    assert.equal(canAccessDesign(submitted), false);
    assert.equal((await submit("DOUBLE-CLICK")).length, 0);
    assert.equal(
      (
        await db
          .update(designPurchases)
          .set(reviewChanges("confirm", "admin", ""))
          .where(reviewFilter(p.id, "0", "confirm"))
          .returning()
      ).length,
      0,
      "An admin's stale review cannot approve a changed reference",
    );
    const [rejected] = await db
      .update(designPurchases)
      .set(reviewChanges("reject", "admin", "Reference not found"))
      .where(reviewFilter(p.id, submitted.revision, "reject"))
      .returning();
    assert.equal(rejected.paymentStatus, "rejected");
    assert.equal(rejected.purchaseStatus, "awaiting_payment");
    const [corrected] = await submit("CORRECTED-REFERENCE");
    const [completed] = await db
      .update(designPurchases)
      .set(reviewChanges("confirm", "admin", "Matched bank statement"))
      .where(reviewFilter(p.id, corrected.revision, "confirm"))
      .returning();
    assert(canAccessDesign(completed));
    assert.equal(completed.purchaseStatus, "completed");
    assert.equal(completed.reviewedBy, "admin");
    assert.equal((await submit("LATE-REFERENCE")).length, 0);
    assert.equal(
      (
        await db
          .update(designPurchases)
          .set(reviewChanges("cancel", "admin", ""))
          .where(reviewFilter(p.id, completed.revision, "cancel"))
          .returning()
      ).length,
      0,
      "Completed purchases cannot be accidentally cancelled",
    );
    const [second] = await db
      .insert(designPurchases)
      .values({ ...values, ...createPurchaseReferences() })
      .returning();
    const [cancelled] = await db
      .update(designPurchases)
      .set(reviewChanges("cancel", "admin", "Customer request"))
      .where(reviewFilter(second.id, second.revision, "cancel"))
      .returning();
    assert.equal(cancelled.accessStatus, "revoked");
    assert.equal(
      (
        await db
          .update(designPurchases)
          .set({ paymentReference: "LATE" })
          .where(paymentSubmissionFilter(second.id, "owner"))
          .returning()
      ).length,
      0,
    );

    const parsed = purchaseSchema.parse({
      fullName: "Sample Customer",
      email: "customer@example.com",
      phone: "+256700000001",
      designSlug: "design",
      packageId: "package",
      acceptTerms: "true",
      amount: "1",
      clerkUserId: "victim",
      packageName: "Forged",
    });
    assert(
      !("amount" in parsed) &&
        !("clerkUserId" in parsed) &&
        !("packageName" in parsed),
      "Browser-controlled price, identity and package content are stripped",
    );
    assert(
      !purchaseSchema.safeParse({ ...parsed, acceptTerms: "false" }).success,
    );
    assert(
      !paymentSchema.safeParse({
        purchaseId: p.id,
        paymentMethod: "confirmed",
        paymentReference: "REF",
      }).success,
    );
    assert.equal(
      formatAmount("999999999999999.99"),
      "UGX 999,999,999,999,999.99",
    );
    assert.equal(
      new Set(
        Array.from(
          { length: 1000 },
          () => createPurchaseReferences().invoiceNumber,
        ),
      ).size,
      1000,
    );

    const invoice = await generateDesignInvoice(p);
    assert.equal(invoice.subarray(0, 5).toString(), "%PDF-");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdfTask = getDocument({
      data: new Uint8Array(invoice),
      useSystemFonts: true,
    });
    const pdf = await pdfTask.promise;
    let invoiceText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const text = await (await pdf.getPage(i)).getTextContent();
      invoiceText += text.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
    }
    for (const expected of [
      p.invoiceNumber,
      p.purchaseReference,
      p.customerName,
      p.designTitle,
      p.packageName,
      "UGX 1,500,000",
      "Awaiting payment",
    ])
      assert(
        invoiceText.includes(expected),
        `Invoice must contain ${expected}`,
      );
    assert.equal(pdf.numPages, 1, "Typical invoice fits one page");
    const longInvoice = await generateDesignInvoice({
      ...p,
      packageIncludes: Array.from(
        { length: 70 },
        (_, i) =>
          `Deliverable ${i + 1}: Detailed architectural documentation with clear construction notes and specifications.`,
      ),
    });
    const longTask = getDocument({
      data: new Uint8Array(longInvoice),
      useSystemFonts: true,
    });
    const longPdf = await longTask.promise;
    assert(longPdf.numPages > 1);
    let longText = "";
    for (let i = 1; i <= longPdf.numPages; i++)
      longText += (await (await longPdf.getPage(i)).getTextContent()).items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
    assert(
      longText.includes("Deliverable 70"),
      "Long package lists must not be truncated",
    );
    if (process.argv.includes("--render")) {
      await mkdir("tmp/pdfs", { recursive: true });
      await writeFile("tmp/pdfs/design-invoice.pdf", invoice);
      await writeFile("tmp/pdfs/design-invoice-long.pdf", longInvoice);
    }
    await pdfTask.destroy();
    await longTask.destroy();
    console.log(
      "Design purchase checks passed: legacy migration, concurrent duplicates, ownership, payment review, rejection/resubmission, stale reviews, cancellation, validation, invoice snapshots and multipage PDFs.",
    );
  } finally {
    await pg.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
