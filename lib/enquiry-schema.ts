import { z } from "zod";

export const INTENTS = ["buy-home", "buy-land", "sell-property"] as const;
export type EnquiryIntent = (typeof INTENTS)[number];

export const JOURNEYS = [
  { value: "buy-home", label: "Find a home" },
  { value: "buy-land", label: "Find land" },
  { value: "sell-property", label: "Sell a property" },
] as const;

export const PROPERTY_TYPES = {
  "buy-home": ["House", "Apartment", "Villa", "Townhouse", "Open to suggestions"],
  "buy-land": ["Residential", "Commercial", "Mixed use", "Agricultural", "Open to suggestions"],
  "sell-property": ["House", "Apartment", "Villa", "Townhouse", "Land", "Commercial property", "Other"],
} as const;

export const TIMELINES = [
  "As soon as possible", "Within 3 months", "Within 6 months", "Later / exploring options",
] as const;

export const DETAILS_FIELDS = [
  "intent", "propertyType", "location", "timeline", "currency", "budgetMin",
  "budgetMax", "askingPrice", "relationship", "notes",
] as const;

export function parseIntent(value: unknown): EnquiryIntent {
  return INTENTS.includes(value as EnquiryIntent) ? value as EnquiryIntent : "buy-home";
}

// Keep money as decimal strings all the way into PostgreSQL numeric columns.
const money = z.string().trim().max(18, "Use a smaller amount.").refine(
  (value) => value === "" || /^(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/.test(value),
  "Enter an amount without commas, using up to two decimal places.",
).refine((value) => value === "" || Number(value) > 0, "Enter an amount above zero.");

function minorUnits(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");

  return (
    BigInt(whole) * BigInt(100) +
    BigInt(fraction.padEnd(2, "0"))
  );
}

export const enquirySchema = z.object({
  intent: z.enum(INTENTS),
  propertyType: z.string().trim().min(1, "Choose a property type.").max(60),
  location: z.string().trim().min(2, "Enter an area, town or region.").max(160, "Keep the location under 160 characters."),
  timeline: z.enum(TIMELINES, { error: "Choose a timeline." }),
  currency: z.enum(["UGX", "USD"]),
  budgetMin: money,
  budgetMax: money,
  askingPrice: money,
  relationship: z.enum(["", "owner", "representative"]),
  notes: z.string().trim().max(2000, "Keep your notes under 2,000 characters."),
  fullName: z.string().trim().min(2, "Enter your name.").max(100, "Keep your name under 100 characters."),
  contactMethod: z.enum(["email", "phone", "whatsapp"]),
  email: z.string().trim().max(254, "Use a shorter email address."),
  phone: z.string().trim().max(40, "Use a shorter phone number."),
}).superRefine((data, ctx) => {
  const issue = (path: keyof typeof data, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message });

  if (!(PROPERTY_TYPES[data.intent] as readonly string[]).includes(data.propertyType)) {
    issue("propertyType", "Choose a property type for this enquiry.");
  }
  if (data.intent === "sell-property" && !data.relationship) {
    issue("relationship", "Tell us your relationship to the property.");
  }
  if (data.intent !== "sell-property" && data.budgetMin && data.budgetMax &&
      money.safeParse(data.budgetMin).success && money.safeParse(data.budgetMax).success &&
      minorUnits(data.budgetMin) > minorUnits(data.budgetMax)) {
    issue("budgetMax", "The maximum should be at least the minimum budget.");
  }
  if (data.contactMethod === "email" && !data.email) {
    issue("email", "Enter the email address we should use.");
  } else if (data.email && !z.email().safeParse(data.email).success) {
    issue("email", "Enter a valid email address.");
  }
  const normalizedPhone = data.phone.replace(/[\s().-]/g, "");
  if (data.contactMethod !== "email" && !data.phone) {
    issue("phone", "Enter a phone number with its country code.");
  } else if (data.phone && !/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
    issue("phone", "Include the country code, for example +256 772 123 456.");
  }
});

export type EnquiryValues = z.infer<typeof enquirySchema>;
export type EnquiryField = keyof EnquiryValues;

export function defaultValues(intent: EnquiryIntent): EnquiryValues {
  return {
    intent, propertyType: "", location: "", timeline: "Later / exploring options",
    currency: "UGX", budgetMin: "", budgetMax: "", askingPrice: "", relationship: "",
    notes: "", fullName: "", contactMethod: "email", email: "", phone: "",
  };
}

export type SubmitEnquiryResult =
  | { ok: true; reference: string }
  | { ok: false; message: string; fieldErrors?: Partial<Record<EnquiryField, string>> };

export const submissionSchema = z.object({
  requestId: z.uuid(),
  values: enquirySchema,
});
