import { redirect } from "next/navigation";
export default async function Page({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const { clientId } = await searchParams;
  const params = new URLSearchParams({ new: "1" });
  if (clientId) params.set("clientId", clientId);
  redirect(`/admin/projects?${params}`);
}
