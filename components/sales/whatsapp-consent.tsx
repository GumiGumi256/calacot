"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retryWhatsAppAfterConsent, updateWhatsAppConsent } from "@/lib/sales/actions";
import { Button } from "@/components/ui/button";
import { TextField, FormMessage } from "./form-controls";

export function WhatsAppConsent({ clientId, contactId, phone, hasConsent }: { clientId: string; contactId: string; phone: string; hasConsent: boolean }) {
  const [evidence, setEvidence] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return <p className="text-sm text-muted-foreground">Add a phone number in international format, such as +256…, before recording consent.</p>;
  return <form className="mt-2 space-y-3 rounded-lg border p-3" onSubmit={(event) => {
    event.preventDefault();
    if (!confirmed) { setMessage("Confirm that the information is accurate."); return; }
    start(async () => {
      try {
        const result = await updateWhatsAppConsent({ clientId, contactId, phone, granted: !hasConsent, evidence });
        if (!result.ok) { setMessage(result.error); return; }
        setEvidence(""); setConfirmed(false); setMessage(hasConsent ? "Consent removed." : "Consent recorded for this phone number."); router.refresh();
      } catch { setMessage("Could not update consent. Please try again."); }
    });
  }}>
    <p className="text-sm font-medium">WhatsApp permission: {hasConsent ? "Recorded" : "Not recorded"}</p>
    <TextField label={hasConsent ? "Reason for removing permission" : "How and when did the client give permission?"} value={evidence} onChange={setEvidence} required hint="Include the date and source, such as a signed form or a conversation." />
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} required /> <span>{hasConsent ? `I confirm permission for ${phone} should be removed.` : `I confirm the client agreed to receive WhatsApp messages at ${phone}.`}</span></label>
    <FormMessage>{message}</FormMessage>
    <Button type="submit" variant="outline" disabled={pending}>{pending ? "Saving…" : hasConsent ? "Remove permission" : "Record permission"}</Button>
  </form>;
}

export function WhatsAppRetry({ id }: { id: string }) {
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return <div><Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => {
    try {
      const result = await retryWhatsAppAfterConsent(id);
      if (!result.ok) { setMessage(result.error); return; }
      setMessage("WhatsApp delivery queued. Check its status here."); router.refresh();
    } catch { setMessage("Could not retry the message. Please try again."); }
  })}>{pending ? "Queueing…" : "Retry after recording consent"}</Button><FormMessage>{message}</FormMessage></div>;
}
