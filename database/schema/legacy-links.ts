import { sql } from "drizzle-orm";
import { check, index, unique, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { instant, scopedForeignKey } from "./common";
import { organizations } from "./organization";
import { clients } from "./clients";
import { opportunities } from "./opportunities";
import { invoices } from "./invoices";
import { leads } from "./lead-intake";
import { realEstateEnquiries, propertyLeads } from "./property-intake";
import { designPurchases } from "./design-purchases";

export const crmSourceLinks = pgTable(
  "crm_source_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    clientId: uuid("client_id"),
    opportunityId: uuid("opportunity_id"),
    invoiceId: uuid("invoice_id"),
    leadId: uuid("lead_id").references(() => leads.id, {
      onDelete: "restrict",
    }),
    realEstateEnquiryId: uuid("real_estate_enquiry_id").references(
      () => realEstateEnquiries.id,
      { onDelete: "restrict" },
    ),
    propertyLeadId: uuid("property_lead_id").references(
      () => propertyLeads.id,
      { onDelete: "restrict" },
    ),
    designPurchaseId: uuid("design_purchase_id").references(
      () => designPurchases.id,
      { onDelete: "restrict" },
    ),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("crm_source_links_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "crm_source_links_clientId_fk",
      t.organizationId,
      t.clientId,
      clients.organizationId,
      clients.id,
    ),
    scopedForeignKey(
      "crm_source_links_opportunityId_fk",
      t.organizationId,
      t.opportunityId,
      opportunities.organizationId,
      opportunities.id,
    ),
    scopedForeignKey(
      "crm_source_links_invoiceId_fk",
      t.organizationId,
      t.invoiceId,
      invoices.organizationId,
      invoices.id,
    ),
    check(
      "crm_source_links_one_source_check",
      sql`num_nonnulls(${t.leadId}, ${t.realEstateEnquiryId}, ${t.propertyLeadId}, ${t.designPurchaseId}) = 1`,
    ),
    check(
      "crm_source_links_destination_check",
      sql`num_nonnulls(${t.clientId}, ${t.opportunityId}, ${t.invoiceId}) >= 1`,
    ),
    unique("crm_source_links_lead_uq").on(t.leadId),
    unique("crm_source_links_estate_uq").on(t.realEstateEnquiryId),
    unique("crm_source_links_property_uq").on(t.propertyLeadId),
    unique("crm_source_links_purchase_uq").on(t.designPurchaseId),
    index("crm_source_links_opportunity_idx").on(
      t.organizationId,
      t.opportunityId,
    ),
  ],
);
export type CrmSourceLinksRecord = typeof crmSourceLinks.$inferSelect;
