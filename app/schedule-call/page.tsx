import { pageMetadata } from "@/lib/seo";
import ScheduleCallForm from "@/components/forms/schedule-call-form";

export const metadata = pageMetadata("/schedule-call");

export default async function ScheduleCallPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const { service } = await searchParams;

  return (
    <main className="container py-24">
      <ScheduleCallForm initialService={service} />
    </main>
  );
}