"use server";

import { eq } from "drizzle-orm";
import { realEstateEnquiries } from "@/database/schema"; 

import { saveEnquiry } from "@/lib/save-enquiry"; 
import type { SubmitEnquiryResult } from "@/lib/enquiry-schema"; 
import { db } from "@/database/db";

export async function submitEstateEnquiry(input: unknown): Promise<SubmitEnquiryResult> {
  return saveEnquiry(input, {
    async insertIfAbsent(record) {
      const rows = await db.insert(realEstateEnquiries).values(record)
        .onConflictDoNothing({ target: realEstateEnquiries.id })
        .returning({ id: realEstateEnquiries.id });
      return rows.length === 1;
    },
    async findHash(id) {
      const [row] = await db.select({ hash: realEstateEnquiries.payloadHash })
        .from(realEstateEnquiries).where(eq(realEstateEnquiries.id, id)).limit(1);
      return row?.hash;
    },
  });
}
