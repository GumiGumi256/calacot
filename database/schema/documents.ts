import { sql } from "drizzle-orm";
import {
  check,
  bigint,
  integer,
  index,
  unique,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { allowed, instant, scopedForeignKey } from "./common";
import { organizations } from "./organization";
import { clients } from "./clients";
import { opportunities } from "./opportunities";
import { quotationVersions } from "./quotations";
import { invoices } from "./invoices";
import { projects } from "./projects";
import { tasks } from "./tasks";
import { expenses } from "./expenses";
import { properties } from "./properties";

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    kind: text("kind", {
      enum: [
        "contract",
        "quotation",
        "invoice",
        "receipt",
        "drawing",
        "brief",
        "expense_receipt",
        "property_document",
        "other",
      ],
    }).notNull(),
    storageKey: text("storage_key").notNull(), // Private object key; generate short-lived signed URLs.
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "bigint" }).notNull(),
    sha256: text("sha256"),
    version: integer("version").notNull().default(1),
    supersedesDocumentId: uuid("supersedes_document_id"),
    createdByClerkUserId: text("created_by_clerk_user_id"),
    archivedAt: instant("archived_at"),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("documents_org_id_uq").on(t.organizationId, t.id),
    allowed("documents_kind_check", t.kind, [
      "contract",
      "quotation",
      "invoice",
      "receipt",
      "drawing",
      "brief",
      "expense_receipt",
      "property_document",
      "other",
    ]),
    check(
      "documents_size_version_check",
      sql`${t.sizeBytes} >= 0 and ${t.version} > 0`,
    ),
    unique("documents_storage_org_uq").on(t.organizationId, t.storageKey),
    index("documents_kind_created_idx").on(
      t.organizationId,
      t.kind,
      t.createdAt,
    ),
    scopedForeignKey(
      "documents_supersedes_fk",
      t.organizationId,
      t.supersedesDocumentId,
      t.organizationId,
      t.id,
    ),
  ],
);
export type DocumentsRecord = typeof documents.$inferSelect;

export const documentLinks = pgTable(
  "document_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    documentId: uuid("document_id").notNull(),
    clientId: uuid("client_id"),
    opportunityId: uuid("opportunity_id"),
    quotationVersionId: uuid("quotation_version_id"),
    invoiceId: uuid("invoice_id"),
    projectId: uuid("project_id"),
    taskId: uuid("task_id"),
    expenseId: uuid("expense_id"),
    propertyId: uuid("property_id"),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("document_links_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "document_links_documentId_fk",
      t.organizationId,
      t.documentId,
      documents.organizationId,
      documents.id,
    ),
    scopedForeignKey(
      "document_links_clientId_fk",
      t.organizationId,
      t.clientId,
      clients.organizationId,
      clients.id,
    ),
    scopedForeignKey(
      "document_links_opportunityId_fk",
      t.organizationId,
      t.opportunityId,
      opportunities.organizationId,
      opportunities.id,
    ),
    scopedForeignKey(
      "document_links_quotationVersionId_fk",
      t.organizationId,
      t.quotationVersionId,
      quotationVersions.organizationId,
      quotationVersions.id,
    ),
    scopedForeignKey(
      "document_links_invoiceId_fk",
      t.organizationId,
      t.invoiceId,
      invoices.organizationId,
      invoices.id,
    ),
    scopedForeignKey(
      "document_links_projectId_fk",
      t.organizationId,
      t.projectId,
      projects.organizationId,
      projects.id,
    ),
    scopedForeignKey(
      "document_links_taskId_fk",
      t.organizationId,
      t.taskId,
      tasks.organizationId,
      tasks.id,
    ),
    scopedForeignKey(
      "document_links_expenseId_fk",
      t.organizationId,
      t.expenseId,
      expenses.organizationId,
      expenses.id,
    ),
    scopedForeignKey(
      "document_links_propertyId_fk",
      t.organizationId,
      t.propertyId,
      properties.organizationId,
      properties.id,
    ),
    check(
      "document_links_one_parent_check",
      sql`num_nonnulls(${t.clientId}, ${t.opportunityId}, ${t.quotationVersionId}, ${t.invoiceId}, ${t.projectId}, ${t.taskId}, ${t.expenseId}, ${t.propertyId}) = 1`,
    ),
    index("document_links_document_idx").on(t.organizationId, t.documentId),
  ],
);
export type DocumentLinksRecord = typeof documentLinks.$inferSelect;

export const documentShares = pgTable(
  "document_shares",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    documentId: uuid("document_id").notNull(),
    tokenHash: text("token_hash").notNull(), // SHA-256 of a cryptographically random token; never store raw token.
    recipientEmail: text("recipient_email"),
    expiresAt: instant("expires_at").notNull(),
    revokedAt: instant("revoked_at"),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("document_shares_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "document_shares_documentId_fk",
      t.organizationId,
      t.documentId,
      documents.organizationId,
      documents.id,
    ),
    check("document_shares_expiry_check", sql`${t.expiresAt} > ${t.createdAt}`),
    unique("document_shares_token_uq").on(t.tokenHash),
  ],
);
export type DocumentSharesRecord = typeof documentShares.$inferSelect;
