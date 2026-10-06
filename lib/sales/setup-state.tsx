import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
export function SalesSetupState({
  kind = "organization",
}: {
  kind?: "organization" | "database";
}) {
  return (
    <main className="p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Sales workspace setup required</CardTitle>
          <CardDescription>
            {kind === "organization"
              ? "The Calacot staff organization has not been configured."
              : "The sales schema or approved organization settings are not available."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>
            Ask the application administrator to complete the sales setup guide
            before creating or sending documents.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
