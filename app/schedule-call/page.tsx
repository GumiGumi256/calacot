import ScheduleCallForm from "@/components/forms/schedule-call-form";

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