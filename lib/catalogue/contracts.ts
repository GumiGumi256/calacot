import { z } from "zod";
import { catalogueItemTypes, currencies, divisions } from "@/lib/sales/contracts";

export { catalogueItemTypes };
export const catalogueTypeLabels: Record<string, string> = { material: "Material", labour: "Labour", service: "Service" };

/** Common painting units; any short unit is accepted. */
export const suggestedUnits = ["m²", "m", "litre", "item", "day", "hour", "coat", "lump sum"];

const text = (n: number) => z.string().trim().max(n);

/** Validated on the server, then re-validated by catalogue_item_save in the database. */
export const catalogueItemSchema = z.object({
  id: z.uuid().optional(),
  rowVersion: z.number().int().positive().optional(),
  name: text(200).min(1, "Enter the item name"),
  division: z.enum(divisions),
  category: text(80).default(""),
  itemType: z.enum(catalogueItemTypes),
  description: text(2000).default(""),
  unit: text(40).min(1, "Enter the unit of measurement"),
  // Decimal string, never a float: at most 2 decimal places, non-negative.
  unitPrice: z.string().trim().regex(/^\d{1,15}(\.\d{1,2})?$/, "Enter a price with at most 2 decimal places"),
  currency: z.enum(currencies),
  isActive: z.boolean().default(true),
  source: z.enum(["catalogue", "quotation"]).default("catalogue"),
}).refine((v) => !v.id || v.rowVersion, { message: "Missing item version; refresh and try again", path: ["rowVersion"] });

export type CatalogueItemInput = z.input<typeof catalogueItemSchema>;

export type CatalogueItem = {
  id: string; code: string; name: string; division: string; category: string | null; item_type: string;
  description: string | null; unit: string; unit_price: string; currency: string; is_active: boolean;
  row_version: number; updated_at: string; updated_by: string | null;
};
