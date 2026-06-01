import StartProjectForm from "@/components/start-project/start-project-form";

export default async function StartProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const { service } = await searchParams;

  return (
    <main className="container py-20">
      <StartProjectForm initialService={service} />
    </main>
  );
}