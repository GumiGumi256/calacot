import { redirect } from "next/navigation";
import { parseQuery, type Entity } from "@/lib/sales/contracts";
import { readList } from "@/lib/sales/reads";
import { EntityList } from "./entity-list";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
export async function SalesListPage({
  entity,
  searchParams,
}: {
  entity: Entity;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams,
    query = parseQuery(raw),
    data = await readList(entity, query);
  if (data.query.page !== query.page) {
    const p = new URLSearchParams(
      Object.entries(raw).filter(
        (v): v is [string, string] => typeof v[1] === "string",
      ),
    );
    p.set("page", String(data.query.page));
    redirect(`/admin/${entity}?${p}`);
  }
  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="capitalize">{entity}</CardTitle>
          <CardDescription>
            {entity === "deliveries"
              ? "Delivery status is separate from acceptance, payment and project execution."
              : "Search, filter and review organization records."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EntityList entity={entity} {...data} />
        </CardContent>
        <CardFooter className="flex flex-wrap gap-6">
          {data.summary.map((s) => (
            <p key={s.currency}>
              {s.currency}: {s.total} matching total
              {entity === "invoices" ? ` · ${s.due} outstanding` : ""}
            </p>
          ))}
        </CardFooter>
      </Card>
    </main>
  );
}
