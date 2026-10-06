import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";
export const currencies = ["UGX", "USD"] as const;
export const divisions = [
  "estates",
  "architecture",
  "painting",
  "interiors",
  "tech",
] as const;
const text = (n: number) => z.string().trim().max(n);
const amount = z.string().regex(/^\d{1,15}(\.\d{1,2})?$/);
export const contactSchema = z
  .object({
    id: z.uuid().optional(),
    name: text(160).min(1),
    email: z
      .union([z.email().max(254), z.literal("")])
      .transform((v) => v.toLowerCase()),
    phone: text(30).transform((v, ctx) => {
      if (!v) return "";
      const p = parsePhoneNumberFromString(v);
      if (!p?.isValid()) {
        ctx.addIssue({
          code: "custom",
          message: "Use a valid international phone, including +country code",
        });
        return z.NEVER;
      }
      return p.number;
    }),
    isPrimary: z.boolean(),
  })
  .refine((v) => v.email || v.phone, "Contact needs email or phone");
export const clientSchema = z
  .object({
    id: z.uuid().optional(),
    kind: z.enum(["individual", "company"]),
    displayName: text(200).min(1),
    legalName: text(200),
    tradingName: text(200).default(""),
    department: z.enum(divisions).optional(),
    taxIdentifier: text(100),
    billingAddress: z.object({
      line1: text(500),
      city: text(100),
      country: text(100),
    }),
    notes: text(4000).optional(),
    contacts: z.array(contactSchema).min(1).max(20),
  })
  .refine(
    (v) => v.contacts.filter((c) => c.isPrimary).length === 1,
    "Select exactly one primary contact",
  )
  .refine(v => !!v.department, "Select a Calacot department")
  .refine(v => v.kind !== "company" || !!v.legalName.trim(), "Company legal name is required")
  .transform(v => ({...v, displayName: v.kind === "company" ? v.tradingName || v.legalName : v.displayName}));
export const projectSchema = z
  .object({
    clientId: z.uuid(),
    name: text(200).min(1),
    division: z.enum(divisions),
    currency: z.enum(currencies),
    scope: text(10000),
    managerId: z.union([z.uuid(), z.literal("")]),
    startsOn: z.union([z.iso.date(), z.literal("")]),
    dueOn: z.union([z.iso.date(), z.literal("")]),
  })
  .refine(
    (v) => !v.startsOn || !v.dueOn || v.dueOn >= v.startsOn,
    "Due date precedes start date",
  );
export const quoteSchema = z.object({
  id: z.uuid().optional(),
  revision: z.number().int().nonnegative(),
  clientId: z.uuid(),
  projectId: z.uuid(),
  contactId: z.uuid(),
  title: text(200).min(1),
  division: z.enum(divisions),
  currency: z.enum(currencies),
  scope: text(10000).min(1),
  deliverables: z.array(text(1000)).max(50),
  exclusions: z.array(text(1000)).max(50),
  terms: text(10000).min(1),
  validUntil: z.iso.datetime(),
  items: z
    .array(
      z.object({
        description: text(2000).min(1),
        unit: text(40).min(1),
        quantity: z.string().regex(/^\d{1,10}(\.\d{1,4})?$/),
        unitPrice: amount,
        discountAmount: amount,
        taxRate: amount,
      }),
    )
    .min(1)
    .max(100),
  schedules: z
    .array(
      z.object({
        label: text(200).min(1),
        amount,
        dueAt: z.union([z.iso.datetime(), z.literal("")]),
      }),
    )
    .min(1)
    .max(20),
});
export const commandSchema = z.object({
  id: z.uuid(),
  versionId: z.uuid().optional(),
  revision: z.number().int().nonnegative().optional(),
  command: z.enum([
    "send",
    "confirm",
    "decline",
    "revise",
    "void",
    "archive",
    "retry",
    "resend",
    "credit",
    "start",
  ]),
  reason: text(2000).optional(),
  source: z
    .enum(["signed_document", "email", "recorded_call", "client_portal"])
    .optional(),
  acceptedBy: text(200).optional(),
  acceptedAt: z.iso.datetime().optional(),
  evidence: text(2000).optional(),
  recipient: z.email().max(254).optional(),
  amount: amount.optional(),
});
export type QueryState = {
  search: string;
  page: number;
  size: number;
  sort: string;
  desc: boolean;
  status: string;
  currency: string;
  division: string;
  kind: string;
  clientId: string;
  payment: string;
  from: string;
  to: string;
};
export type Entity =
  | "clients"
  | "projects"
  | "quotations"
  | "invoices"
  | "deliveries";
export type ListRow = {
  id: string;
  name: string;
  number: string;
  client: string;
  project: string;
  status: string;
  currency: string;
  total: string;
  due: string;
  created: string;
  email: string;
  phone: string;
  delivery: string;
  balance: string;
  payment: string;
  kind: string;
  division: string;
  activeProjects: number;
};
export function parseQuery(
  p: Record<string, string | string[] | undefined>,
): QueryState {
  const get = (key: string) =>
    typeof p[key] === "string" ? (p[key] as string) : "";
  const positive = (v: string, fallback: number, max: number) =>
    /^\d{1,7}$/.test(v) ? Math.min(max, Math.max(1, Number(v))) : fallback;
  return {
    search: get("search").slice(0, 200),
    page: positive(get("page"), 1, 100000),
    size: [10, 25, 50, 100].includes(Number(get("size")))
      ? Number(get("size"))
      : 25,
    sort: ["name", "number", "created", "total", "due", "status"].includes(
      get("sort"),
    )
      ? get("sort")
      : "created",
    desc: get("desc") !== "false",
    status: get("status").slice(0, 32),
    currency: currencies.includes(
      get("currency") as (typeof currencies)[number],
    )
      ? get("currency")
      : "",
    division: divisions.includes(get("division") as (typeof divisions)[number])
      ? get("division")
      : "",
    kind: ["individual", "company"].includes(get("kind")) ? get("kind") : "",
    clientId: z.uuid().safeParse(get("clientId")).success
      ? get("clientId")
      : "",
    payment: ["paid", "unpaid", "partial", "overdue"].includes(get("payment"))
      ? get("payment")
      : "",
    from: z.iso.date().safeParse(get("from")).success ? get("from") : "",
    to: z.iso.date().safeParse(get("to")).success ? get("to") : "",
  };
}
export const literalSearch = (s: string) => `%${s.replace(/[\\%_]/g, "\\$&")}%`;
