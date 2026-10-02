"use server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/database/db";
import { requireUser } from "@/lib/design-purchases/permissions";
import { consumeLinkQuery } from "@/lib/customer-care/queries";
import { redirect } from "next/navigation";
export async function approveAccountLink(form: FormData) {
  const token = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(form.get("token"));
  const userId = await requireUser(
    `/account/customer-care/link?token=${token}`,
  );
  const result = await db.execute(
    consumeLinkQuery(createHash("sha256").update(token).digest("hex"), userId),
  );
  redirect(
    `/account/customer-care/link?result=${result.rows.length ? "linked" : "expired"}`,
  );
}
