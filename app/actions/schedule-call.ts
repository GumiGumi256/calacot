"use server";

import { db } from "@/database/db"; 
import { leads } from "@/database/schema";
import { scheduleCallSchema, type ScheduleCallFormData } from "@/lib/validations/schedule-call";

export async function createScheduledCallLead(data: ScheduleCallFormData) {
  try {
    // 1. Validate form fields server-side
    const validatedData = scheduleCallSchema.parse(data);

    // 2. Insert into the `leads` table
    const [insertedLead] = await db
      .insert(leads)
      .values({
        type: "scheduled_call",
        service: validatedData.service,
        fullName: validatedData.fullName,
        email: validatedData.email,
        phone: validatedData.phone,
        projectOverview: validatedData.projectOverview,
        preferredDate: validatedData.date,
        preferredTime: validatedData.time,
        status: "new",
      })
      .returning();

    return { success: true, data: insertedLead };
  } catch (error) {
    console.error("Failed to save lead:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Something went wrong. Please try again.",
    };
  }
}