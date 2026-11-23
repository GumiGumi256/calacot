"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createDocumentShare, revokeDocumentShares } from "@/lib/sales/share-actions";

export function ShareDocument({ kind, id }: { kind: "invoice" | "receipt"; id: string }) {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return <div className="space-y-2 rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-3 text-sm">
    <p className="font-medium">Share {kind}</p>
    <p className="text-muted-foreground">Anyone with this private link can open the document for 7 days. Only share it with the intended client.</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => start(async () => { const result = await createDocumentShare({ kind, id }); if (result.ok) { setUrl(result.url); setMessage("Link created. It expires in 7 days."); } else setMessage(result.error); })}>Create secure link</Button>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => { if (!window.confirm(`Revoke all existing links for this ${kind}?`)) return; start(async () => { const result = await revokeDocumentShares({ kind, id }); if (result.ok) { setUrl(""); setMessage("All existing links were revoked."); } else setMessage(result.error); }); }}>Revoke all links</Button>
    </div>
    {url && <div className="space-y-2"><input aria-label="Secure document link" className="w-full rounded-md border border-input bg-background p-2" value={url} readOnly onFocus={(e) => e.currentTarget.select()} /><div className="flex flex-wrap gap-3"><button type="button" className="underline" onClick={async () => { try { await navigator.clipboard.writeText(url); setMessage("Link copied."); } catch { setMessage("Select and copy the link above."); } }}>Copy link</button><a className="underline" href={`https://wa.me/?text=${encodeURIComponent(`Please view your Calacot ${kind}: ${url}`)}`} target="_blank" rel="noopener noreferrer">Share via WhatsApp</a></div></div>}
    {message && <p role="status">{message}</p>}
  </div>;
}
