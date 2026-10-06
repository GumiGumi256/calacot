import { staffContext } from "@/lib/sales/permissions";
import { pickers } from "@/lib/sales/reads";
import { ProjectForm } from "@/components/sales/project-form";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
export default async function Page() {
  await staffContext("projects_write");
  const data = await pickers();
  return (
    <main className="p-4 md:p-6">
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>New planned project</CardTitle>
          <CardDescription>
            Pre-sales project. Confirmation will retain this project and its
            planned execution status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectForm clients={data.clients} owners={data.owners} />
        </CardContent>
      </Card>
    </main>
  );
}
