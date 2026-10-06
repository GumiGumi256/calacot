"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  quotationCommand,
  invoiceCommand,
  deliveryCommand,
  archiveClient,
} from "@/lib/sales/actions";
import type { Permission } from "@/lib/sales/permissions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { TextField, ChoiceField, FormMessage } from "./form-controls";
export function TransitionControls({
  entity,
  id,
  versionId,
  revision,
  status,
  summary,
  permissions,
}: {
  entity: "quotations" | "invoices" | "deliveries" | "clients";
  id: string;
  versionId?: string;
  revision?: number;
  status: string;
  summary: string;
  permissions: Permission[];
}) {
  const router = useRouter();
  const [command, setCommand] = useState("");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [source, setSource] = useState("email");
  const [acceptedBy, setAcceptedBy] = useState("");
  const [acceptedAt, setAcceptedAt] = useState("");
  const [evidence, setEvidence] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const allowed: string[] = [];
  if (entity === "quotations") {
    if (status === "draft" && permissions.includes("quotations_send"))
      allowed.push("send");
    if (status === "sent" && permissions.includes("quotations_confirm"))
      allowed.push("confirm");
    if (status === "sent" && permissions.includes("quotations_edit"))
      allowed.push("decline");
    if (
      ["sent", "declined", "expired"].includes(status) &&
      permissions.includes("quotations_edit")
    )
      allowed.push("revise");
  } else if (
    entity === "invoices" &&
    status === "issued" &&
    permissions.includes("invoices_void")
  )
    allowed.push("void", "credit");
  else if (
    entity === "clients" &&
    status === "active" &&
    permissions.includes("clients_write")
  )
    allowed.push("archive");
  else if (
    entity === "deliveries" &&
    permissions.includes("notifications_manage")
  ) {
    if (["failed", "blocked"].includes(status)) allowed.push("retry");
    if (!["queued", "processing"].includes(status)) allowed.push("resend");
  }
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {allowed.map((c) => (
          <Button
            key={c}
            variant={
              c === "void" || c === "archive" ? "destructive" : "outline"
            }
            onClick={() => {
              setCommand(c);
              setMessage("");
            }}
          >
            {c === "retry"
              ? "Retry failed delivery"
              : c === "resend"
                ? "Send again"
                : c[0].toUpperCase() + c.slice(1)}
          </Button>
        ))}
      </div>
      <Dialog
        open={!!command}
        onOpenChange={(open) => {
          if (!open && !pending) setCommand("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {command[0]?.toUpperCase() + command.slice(1)}
            </DialogTitle>
            <DialogDescription>
              {summary}
              {command === "confirm"
                ? " Verified acceptance will issue an initial invoice and queue independent email and WhatsApp jobs. Payment remains unverified; execution remains planned."
                : command === "send"
                  ? " Finalizes this exact revision and queues a PDF email. Delivery is tracked separately."
                  : command === "resend"
                    ? " Creates a new audited delivery intent. An uncertain prior send may already have reached the recipient."
                    : ""}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const p = {
                  id,
                  versionId,
                  revision,
                  command,
                  reason,
                  source,
                  acceptedBy,
                  acceptedAt: acceptedAt
                    ? new Date(acceptedAt).toISOString()
                    : undefined,
                  evidence,
                  recipient: recipient || undefined,
                  amount: amount || undefined,
                };
                const r =
                  entity === "quotations"
                    ? await quotationCommand(p)
                    : entity === "invoices"
                      ? await invoiceCommand(p)
                      : entity === "deliveries"
                        ? await deliveryCommand(p)
                        : await archiveClient(id);
                if (r.ok) {
                  setCommand("");
                  router.refresh();
                  if (
                    entity === "quotations" &&
                    command === "confirm" &&
                    typeof r.value === "object" &&
                    r.value &&
                    "invoiceId" in r.value &&
                    r.value.invoiceId
                  )
                    router.push(`/admin/invoices/${r.value.invoiceId}`);
                } else setMessage(r.error);
              });
            }}
          >
            <FieldGroup>
              {command === "confirm" && (
                <>
                  <ChoiceField
                    label="Acceptance source"
                    value={source}
                    onChange={setSource}
                    options={[
                      "signed_document",
                      "email",
                      "recorded_call",
                      "client_portal",
                    ].map((value) => ({
                      value,
                      label: value.replaceAll("_", " "),
                    }))}
                  />
                  <TextField
                    label="Accepted by (verified identity)"
                    value={acceptedBy}
                    onChange={setAcceptedBy}
                    required
                  />
                  <TextField
                    label="Actual acceptance time"
                    type="datetime-local"
                    value={acceptedAt}
                    onChange={setAcceptedAt}
                    required
                  />
                  <TextField
                    label="Evidence / reference"
                    value={evidence}
                    onChange={setEvidence}
                    multiline
                    required
                    hint="Reference a verified email, signed agreement or recorded acceptance. A typed name alone is insufficient."
                  />
                </>
              )}
              {["decline", "void", "credit", "resend"].includes(command) && (
                <TextField
                  label="Reason"
                  value={reason}
                  onChange={setReason}
                  multiline
                  required
                />
              )}
              {command === "credit" && (
                <TextField
                  label="Credit amount"
                  value={amount}
                  onChange={setAmount}
                  required
                />
              )}
              {command === "resend" && (
                <TextField
                  label="Corrected email (optional)"
                  type="email"
                  value={recipient}
                  onChange={setRecipient}
                  hint="Blank keeps the original delivery recipient."
                />
              )}
              <FormMessage>{message}</FormMessage>
              <Button type="submit" disabled={pending}>
                {pending ? "Processing…" : `Confirm ${command}`}
              </Button>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
