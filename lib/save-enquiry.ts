import { createHash } from "node:crypto";
import { defaultValues, submissionSchema, type EnquiryField, type SubmitEnquiryResult } from "./enquiry-schema";

export interface EnquiryRecord {
  id: string;
  payloadHash: string;
  intent: "buy-home" | "buy-land" | "sell-property";
  propertyType: string;
  location: string;
  timeline: string;
  currency: "UGX" | "USD";
  budgetMin: string | null;
  budgetMax: string | null;
  askingPrice: string | null;
  relationship: "owner" | "representative" | null;
  notes: string | null;
  fullName: string;
  contactMethod: "email" | "phone" | "whatsapp";
  email: string | null;
  phone: string | null;
}

export interface EnquiryRepository {
  insertIfAbsent(record: EnquiryRecord): Promise<boolean>;
  findHash(id: string): Promise<string | undefined>;
}

// The service is independent of the adapter so validation, retries and failures
// can be tested without connecting to a production database.
export async function saveEnquiry(
  input: unknown,
  repository: EnquiryRepository,
): Promise<SubmitEnquiryResult> {
  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<EnquiryField, string>> = {};
    const known = defaultValues("buy-home");
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] === "values" ? issue.path[1] : undefined;
      if (typeof field === "string" && Object.hasOwn(known, field)) {
        fieldErrors[field as EnquiryField] ??= issue.message;
      }
    }
    return { ok: false, message: "Please check the highlighted details and try again.", fieldErrors };
  }

  const { requestId, values } = parsed.data;
  const seller = values.intent === "sell-property";
  const details = {
    intent: values.intent, propertyType: values.propertyType,
    location: values.location, timeline: values.timeline, currency: values.currency,
    budgetMin: seller ? null : values.budgetMin || null,
    budgetMax: seller ? null : values.budgetMax || null,
    askingPrice: seller ? values.askingPrice || null : null,
    relationship: seller ? values.relationship || null : null,
    notes: values.notes || null, fullName: values.fullName,
    contactMethod: values.contactMethod,
    email: values.email || null,
    phone: values.phone.replace(/[\s().-]/g, "") || null,
  };
  const payloadHash = createHash("sha256").update(JSON.stringify(details)).digest("hex");

  try {
    const inserted = await repository.insertIfAbsent({ id: requestId, payloadHash, ...details });
    if (!inserted && await repository.findHash(requestId) !== payloadHash) {
      return { ok: false, message: "This submission reference is already in use. Refresh the page before sending a new enquiry." };
    }
    return { ok: true, reference: `CE-${requestId.toUpperCase()}` };
  } catch {
    // Do not log contact information or raw database errors containing parameters.
    console.error("Calacot Estates: enquiry persistence failed.");
    return { ok: false, message: "We couldn’t confirm your enquiry was saved. Your details are still here. Please try again." };
  }
}
