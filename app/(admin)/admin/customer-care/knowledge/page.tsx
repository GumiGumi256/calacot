import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/design-purchases/permissions";
export default async function KnowledgeManagement() {
  await requireAdmin();
  redirect("/admin/customer-care");
}
