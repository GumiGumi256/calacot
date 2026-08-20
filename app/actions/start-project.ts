// actions/start-project.ts
"use server";

import { db } from "@/database/db"; 
import { leads } from "@/database/schema"; 
import { startProjectSchema, type StartProjectFormData } from "@/lib/validations/project";

export async function createProjectLead(data: StartProjectFormData) {
  try {
    const validatedData = startProjectSchema.parse(data);

    const [insertedLead] = await db
      .insert(leads)
      .values({
        type: "project_request",
        fullName: validatedData.fullName,
        email: validatedData.email,
        phone: validatedData.phone,
        service: validatedData.service,
        projectLocation: validatedData.projectLocation,
        estimatedBudget: validatedData.estimatedBudget,
        timeline: validatedData.timeline,
        projectOverview: validatedData.projectOverview,
        status: "new",
      })
      .returning();

    return { success: true, data: insertedLead };
  } catch (error) {
    console.error("Failed to submit project request:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save project request.",
    };
  }
}