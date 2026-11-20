import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { TransitionControls } from "./transition-controls";
import type { Permission } from "@/lib/sales/permissions";
import { formatDateTime } from "@/lib/format";

/** Audit actions ("quotation.confirm") in plain language; unknown actions are humanised. */
const actionLabels: Record<string, string> = {
  save: "Draft saved",
  create: "Created",
  update: "Updated",
  send: "Sent to client",
  confirm: "Acceptance recorded",
  decline: "Marked as declined",
  revise: "Revision created",
  issue: "Issued",
  void: "Voided",
  credit: "Credit note issued",
  archive: "Archived",
  start: "Started",
  complete: "Completed",
};
export function activityLabel(action: string) {
  const [entity, verb = entity] = action.split(".");
  const label = actionLabels[verb] ?? verb.replaceAll("_", " ");
  const subject = action.includes(".") ? entity.replaceAll("_", " ") : "";
  const text = subject ? `${subject[0].toUpperCase()}${subject.slice(1)}: ${label.toLowerCase()}` : label;
  return text[0].toUpperCase() + text.slice(1);
}

const channelLabels: Record<string, string> = { email: "Email", whatsapp: "WhatsApp" };

export function Activity({ events }: { events: Record<string, unknown>[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Activity</CardTitle>
        <CardDescription>Audited business transitions, newest first.</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length ? (
          <ol className="flex flex-col">
            {events.map((e, i) => (
              <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                <span aria-hidden className="relative mt-1.5 flex flex-col items-center">
                  <span className="size-2 rounded-full bg-muted-foreground/50" />
                  {i < events.length - 1 && <span className="absolute top-3 h-[calc(100%+0.25rem)] w-px bg-border" />}
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="type-body-strong">{activityLabel(String(e.action))}</span>
                  <span className="type-caption">{formatDateTime(String(e.created_at))}</span>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState kind="no-records" compact title="No activity yet" description="Changes to this record will be listed here." />
        )}
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
        <CardTitle as="h2">Delivery history</CardTitle>
        <CardDescription>
          Email acceptance does not establish quotation acceptance or payment.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!rows.length && <p className="type-description">No delivery has been requested yet.</p>}
        {rows.map((d) => (
          <div key={String(d.id)} className="flex flex-col gap-2 rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="type-body-strong">{channelLabels[String(d.channel)] ?? String(d.channel)}</span>
              <span className="type-body [overflow-wrap:anywhere]">{String(d.recipient)}</span>
              <StatusBadge domain="delivery" status={String(d.status)} />
            </div>
            {!!d.error_code && (
              <p role="note" className="type-body text-destructive-text">
                Needs attention: {String(d.error_code).replaceAll("_", " ")}
              </p>
            )}
            <p className="type-caption">
              Requested {formatDateTime(String(d.created_at))} · {d.first_attempt_at ? `First attempt ${formatDateTime(String(d.first_attempt_at))}` : "Not attempted yet"}
            </p>
            {Array.isArray(d.attempts) && d.attempts.length > 0 && (
              <ol className="flex flex-col gap-1 type-caption">
                {d.attempts.map((a: Record<string, unknown>, i: number) => (
                  <li key={i}>
                    Attempt {String(a.attempt)}: {String(a.state).replaceAll("_", " ")}, {formatDateTime(String(a.at))}
                  </li>
                ))}
              </ol>
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
