import { z } from "zod";
// Editable business settings only. Secrets (API keys, database, webhook and provider
// credentials) and the approved tax rate are deliberately not part of this schema.
const text = (n: number) => z.string().trim().max(n);
const bank = z.object({ name: text(100).min(1), number: text(60).min(1), account: text(120).min(1), swift: text(20), currency: z.enum(["UGX", "USD"]) });
const mobile = z.object({ network: text(60).min(1), number: text(30).min(1), account: text(120).min(1), currency: z.enum(["UGX", "USD"]) });
export const divisionKeys = ["estates", "architecture", "painting", "interiors", "tech"] as const;
export const settingsSchema = z.object({
  identity: z.object({ legalName: text(200).min(1), tradingName: text(200), taxIdentifier: text(60) }),
  contacts: z.object({ email: z.union([z.email().max(254), z.literal("")]), phone: text(30) }),
  address: z.object({ line1: text(200), city: text(100), country: text(100) }),
  divisions: z.array(z.object({ key: z.enum(divisionKeys), label: text(60).min(1), enabled: z.boolean() })).length(5)
    .refine((d) => new Set(d.map((x) => x.key)).size === 5, "Each division once")
    .refine((d) => d.some((x) => x.enabled), "At least one division must stay enabled"),
  payment: z.object({ bank: bank.nullable(), mobile: mobile.nullable() }),
  defaults: z.object({ defaultCurrency: z.enum(["UGX", "USD"]) }),
});
export type CompanySettings = z.infer<typeof settingsSchema>;
export const sectionLabels: Record<string, string> = {
  identity: "Legal and trading identity", contacts: "Business contacts", address: "Physical address",
  divisions: "Operating divisions", payment: "Approved payment instructions", defaults: "Operational defaults",
};
