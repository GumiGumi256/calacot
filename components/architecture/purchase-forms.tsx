"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  submitDesignPaymentReference,
  confirmDesignPayment,
  rejectDesignPayment,
  cancelDesignPurchase,
  requestDesignAssistance,
  retryDesignPurchaseEmail,
} from "@/lib/design-purchases/actions";
import type { ActionState, PurchaseAction } from "@/lib/design-purchases/model";

const fieldClass =
  "mt-2 block w-full rounded-xl border border-input bg-background px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
function Result({ state }: { state: ActionState }) {
  return (
    <>
      {state.error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="mt-4 text-sm">
          {state.success}
        </p>
      )}
    </>
  );
}
export function PaymentReferenceForm({ purchaseId }: { purchaseId: string }) {
  const [state, action, pending] = useActionState(
    submitDesignPaymentReference,
    {},
  );
  return (
    <details className="mt-8 rounded-2xl border border-border p-5">
      <summary className="cursor-pointer text-base font-medium">
        I&apos;ve made payment
      </summary>
      <form action={action} className="mt-5 space-y-4">
        <input type="hidden" name="purchaseId" value={purchaseId} />
        <label className="block text-sm">
          Payment method
          <select name="paymentMethod" className={fieldClass} required>
            <option value="mobile_money">Mobile Money</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="block text-sm">
          Transaction or receipt reference
          <input
            name="paymentReference"
            minLength={3}
            maxLength={150}
            required
            className={fieldClass}
            aria-describedby="payment-reference-help"
          />
        </label>
        <p
          id="payment-reference-help"
          className="text-xs leading-6 text-muted-foreground"
        >
          Use the reference from your transaction confirmation or Calacot
          receipt. Our team will check your payment before activating access.
        </p>
        <Result state={state} />
        <Button type="submit" disabled={pending} className="rounded-xl">
          {pending ? "Submitting…" : "Submit for verification"}
        </Button>
      </form>
    </details>
  );
}

function ReviewForm({
  purchaseId,
  revision,
  action: serverAction,
  label,
  description,
  destructive = false,
  notesRequired = false,
}: {
  purchaseId: string;
  revision: string;
  action: PurchaseAction;
  label: string;
  description: string;
  destructive?: boolean;
  notesRequired?: boolean;
}) {
  const [state, action, pending] = useActionState(serverAction, {});
  return (
    <details className="rounded-xl border border-border p-5">
      <summary className="cursor-pointer text-sm font-medium">{label}</summary>
      <form action={action} className="mt-4">
        <input type="hidden" name="purchaseId" value={purchaseId} />
        <input type="hidden" name="revision" value={revision} />
        <p className="text-xs leading-6 text-muted-foreground">{description}</p>
        <label className="mt-4 block text-sm">
          Admin notes {notesRequired ? "(required)" : "(optional)"}
          <textarea
            name="adminNotes"
            rows={3}
            maxLength={4000}
            required={notesRequired}
            className={fieldClass}
          />
        </label>
        <Result state={state} />
        <Button
          type="submit"
          disabled={pending}
          variant={destructive ? "outline" : "default"}
          className="mt-4 rounded-lg"
        >
          {pending ? "Saving…" : label}
        </Button>
      </form>
    </details>
  );
}
export function AdminReviewForms({
  purchaseId,
  revision,
  submitted,
}: {
  purchaseId: string;
  revision: string;
  submitted: boolean;
}) {
  return (
    <div className="mt-6 space-y-3">
      <ReviewForm
        purchaseId={purchaseId}
        revision={revision}
        action={confirmDesignPayment}
        label="Confirm payment"
        description="Confirm only after checking the exact amount against Calacot's payment records. This grants access and sends a confirmation email."
      />
      {submitted && (
        <ReviewForm
          purchaseId={purchaseId}
          revision={revision}
          action={rejectDesignPayment}
          label="Reject payment"
          description="The purchase stays open so the customer can submit a corrected reference. These notes are internal."
          destructive
          notesRequired
        />
      )}
      <ReviewForm
        purchaseId={purchaseId}
        revision={revision}
        action={cancelDesignPurchase}
        label="Cancel purchase"
        description="This closes the purchase without granting access. Only unpaid, open purchases can be cancelled here."
        destructive
      />
    </div>
  );
}

export function PurchaseAssistanceForm({ purchaseId }: { purchaseId: string }) {
  const [state, action, pending] = useActionState(requestDesignAssistance, {});
  return (
    <form action={action} className="mt-5">
      <input type="hidden" name="purchaseId" value={purchaseId} />
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        className="rounded-xl"
      >
        {pending ? "Requesting…" : "Ask Calacot to contact me"}
      </Button>
      <Result state={state} />
    </form>
  );
}
export function RetryPurchaseEmailForm({ purchaseId }: { purchaseId: string }) {
  const [state, action, pending] = useActionState(retryDesignPurchaseEmail, {});
  return (
    <form action={action} className="mt-5">
      <input type="hidden" name="purchaseId" value={purchaseId} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Queuing…" : "Retry undelivered emails"}
      </Button>
      <Result state={state} />
    </form>
  );
}
