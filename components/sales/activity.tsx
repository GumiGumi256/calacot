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
import { WhatsAppDeliveryRetry, WhatsAppRetry } from "./whatsapp-consent";

/** Meta Cloud API error codes staff are most likely to hit, in plain language. */
const metaErrors: Record<string, string> = {
  "131030": "This number isn't on the allowed recipient list. While the WhatsApp number is in test mode, add the recipient in Meta's WhatsApp settings first.",
  "131026": "WhatsApp couldn't deliver to this number. It may not be on WhatsApp, or the client may need to update the app.",
  "131049": "WhatsApp chose not to deliver this message right now, to protect the recipient's experience. Try again later.",
  "131050": "The client has stopped marketing messages from this business on WhatsApp.",
  "131056": "Too many messages were sent to this number in a short time. Wait a few minutes, then retry.",
  "131047": "More than 24 hours have passed since the client last replied. Only an approved template can be sent.",
  "132000": "The template's number of fields doesn't match what WhatsApp approved. Check the template setup.",
  "132001": "The template doesn't exist in this language, or isn't approved yet. Check the template name and language.",
  "132012": "A template field is in the wrong format. Check the template setup.",
  "133010": "The business WhatsApp number isn't registered. Finish phone number registration in Meta.",
  "190": "The WhatsApp access token has expired. Update the token in settings, then retry.",
  "10": "The WhatsApp app is missing a permission. Check the Meta app permissions, then retry.",
  "100": "WhatsApp rejected a field in the message. Check the template setup and phone number.",
};

function deliveryProblem(code: string, unsent: boolean) {
  if (code.startsWith("provider_ambiguous") && unsent)
    return "The last attempt stopped before WhatsApp was contacted, so the message was not sent. It's safe to retry.";
  if (code === "consent_missing")
    return "WhatsApp consent is missing for this phone number. Record the client's permission on their contact before retrying.";
  if (code.startsWith("provider_rejected")) {
    const meta = /meta_(\d+)/.exec(code)?.[1];
    const known = meta && metaErrors[meta];
    return known ? `WhatsApp rejected this message: ${known} (code ${meta})` : `WhatsApp rejected this message${meta ? ` (code ${meta})` : ""}. Check the details, then retry.`;
  }
  return `Needs attention: ${code.replaceAll("_", " ")}`;
}

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
                {deliveryProblem(String(d.error_code), d.whatsapp_unsent === true)}
              </p>
            )}
            <p className="type-caption">
              Requested {formatDateTime(String(d.created_at))} · {d.first_attempt_at ? `First attempt ${formatDateTime(String(d.first_attempt_at))}` : "Not attempted yet"}{d.whatsapp_template ? ` · Template ${String(d.whatsapp_template)}` : ""}
            </p>
            {Array.isArray(d.attempts) && d.attempts.length > 0 && (
              <ol className="flex flex-col gap-1 type-caption">
                {d.attempts.map((a: Record<string, unknown>, i: number) => (
                  <li key={i}>
                    Attempt {i + 1}: {String(a.state).replaceAll("_", " ")}{a.code && String(a.code).startsWith("provider_rejected:meta_") ? ` (code ${String(a.code).replace(/^provider_rejected:meta_/, "")})` : ""}, {formatDateTime(String(a.at))}
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
            {d.channel === "whatsapp" && d.status === "skipped" && d.error_code === "consent_missing" && permissions.includes("notifications_manage") && <WhatsAppRetry id={String(d.id)} />}
            {d.channel === "whatsapp" && ["blocked", "failed", "uncertain"].includes(String(d.status)) && !d.provider_id && (!String(d.error_code ?? "").startsWith("provider_ambiguous") || d.whatsapp_unsent === true) && permissions.includes("notifications_manage") && <WhatsAppDeliveryRetry id={String(d.id)} />}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
