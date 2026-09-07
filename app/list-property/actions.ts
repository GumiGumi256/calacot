"use server";

import { queueEnquiryEmails } from "@/lib/email/queue";

import { db } from "@/database/db"; 
import { propertyLeads } from "@/database/schema"; 
import {
  propertyLeadSchema,
  type PropertyLeadResult,
} from "@/lib/property-lead-schema";

export async function submitPropertyLead(
  input: unknown,
): Promise<PropertyLeadResult> {
  const result = propertyLeadSchema.safeParse(input);

  if (!result.success) {
    return {
      success: false,
      message: "Please check the highlighted fields.",
      errors: result.error.flatten().fieldErrors,
    };
  }

  const values = result.data;

  try {
    const [saved] = await db.insert(propertyLeads).values({
      submissionType: values.submissionType,
      propertyType: values.propertyType,
      location: values.location,
      details: values.details || null,

      fullName: values.fullName,
      phone: values.phone.replace(/[\s()-]/g, ""),
      email: values.email || null,
    }).returning();

    queueEnquiryEmails({ id: saved.id, kind: "property", email: saved.email, details: saved });
    return { success: true };
  } catch {
    console.error("Failed to save property lead.");

    return {
      success: false,
      message:
        "We couldn’t confirm your submission. Your details are still here—please try again.",
    };
  }
}