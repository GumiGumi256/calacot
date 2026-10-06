import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TransitionControls } from "./transition-controls";
import type { Permission } from "@/lib/sales/permissions";
export function Activity({ events }: { events: Record<string, unknown>[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>Audited business transitions</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3">
          {events.map((e, i) => (
            <li key={i}>
              <span className="font-medium">{String(e.action)}</span> ·{" "}
              {String(e.created_at)}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
export function Deliveries({
  rows,
  permissions,
}: {
  rows: Record<string, unknown>[];
  permissions: Permission[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Delivery history</CardTitle>
        <CardDescription>
          Email acceptance does not establish quotation acceptance or payment.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!rows.length && <p>No delivery requested.</p>}
        {rows.map((d) => (
          <div
            key={String(d.id)}
            className="flex flex-col gap-2 rounded-md border p-3"
          >
            <p>
              {String(d.channel)} · {String(d.recipient)} ·{" "}
              <Badge variant="secondary">{String(d.status)}</Badge>
            </p>
            {!!d.error_code && (
              <p className="text-sm">
                Delivery needs attention:{" "}
                {String(d.error_code).replaceAll("_", " ")}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Requested {String(d.created_at)} · Attempted{" "}
              {String(d.first_attempt_at || "—")}
            </p>
            {Array.isArray(d.attempts) && (
              <ul>
                {d.attempts.map((a: Record<string, unknown>, i: number) => (
                  <li key={i}>
                    Attempt {String(a.attempt)} · {String(a.state)} ·{" "}
                    {String(a.at)}
                  </li>
                ))}
              </ul>
            )}
            {d.channel === "email" && (
              <TransitionControls
                entity="deliveries"
                id={String(d.id)}
                status={String(d.status)}
                summary={`${d.entity_type} · ${d.channel} · ${d.recipient}`}
                permissions={permissions}
              />
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
