"use server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { leadStatuses } from "./options";

const schema = z.object({
  id: z.uuid(),
  status: z.enum(leadStatuses),
  adminNotes: z.string().trim().max(4000),
});

export async function updateLead(formData: FormData) {
  await staffContext("leads_write");
  const parsed = schema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    adminNotes: formData.get("adminNotes") ?? "",
  });
  if (!parsed.success) return;
  const { id, status, adminNotes } = parsed.data;
  await db.execute(
    sql`UPDATE leads SET status=${status},admin_notes=${adminNotes || null} WHERE id=${id}::uuid`,
  );
  revalidatePath("/", "layout");
}
