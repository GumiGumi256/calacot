"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from "lucide-react";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { Button } from "@/components/ui/button";
import type { PurchaseAction } from "@/lib/design-purchases/model";

type Props = {
  design: { id: string; title: string; slug: string; code?: string | null };
  selectedPackage: {
    id: string;
    name: string;
    description?: string | null;
    includes: string[];
    price: number;
  };
  customer: { fullName: string; email: string; phone: string };
  action: PurchaseAction;
};
const inputClass =
  "mt-2 h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30";

export default function DesignCheckout({
  design,
  selectedPackage,
  customer,
  action,
}: Props) {
  const [phoneValue, setPhoneValue] = useState<string | undefined>(
    customer.phone || "",
  );
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-24 sm:px-6 lg:px-8 lg:pt-28">
        <Link
          href={`/architecture/designs/${encodeURIComponent(design.slug)}`}
          className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to design details
        </Link>
        <header className="mb-12 mt-8 border-b border-border/60 pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Calacot Architecture
          </p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl lg:text-5xl">
            Acquire Design Package
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Review your package and confirm your request. Your invoice and
            payment options follow.
          </p>
        </header>
        <form
          action={formAction}
          className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16"
        >
          <input type="hidden" name="designSlug" value={design.slug} />
          <input type="hidden" name="packageId" value={selectedPackage.id} />
          <div className="min-w-0 space-y-10">
            <section aria-labelledby="customer-heading" className="space-y-6">
              <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-3">
                <h2 id="customer-heading" className="text-base font-medium">
                  1. Contact information
                </h2>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Check className="size-3" aria-hidden="true" />
                  Signed in
                </span>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="text-xs font-medium sm:col-span-2">
                  Full name
                  <input
                    name="fullName"
                    autoComplete="name"
                    required
                    maxLength={150}
                    defaultValue={customer.fullName}
                    placeholder="Your full name"
                    className={inputClass}
                  />
                </label>
                <label className="min-w-0 text-xs font-medium">
                  Account email
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    readOnly
                    defaultValue={customer.email}
                    className={inputClass}
                  />
                  <span className="mt-2 block text-xs font-normal text-muted-foreground">
                    Your invoice goes to your verified account email.
                  </span>
                </label>
                <div className="min-w-0 text-xs font-medium">
                  <label htmlFor="purchase-phone" className="block mb-2">
                    Phone number
                  </label>
                  <input type="hidden" name="phone" value={phoneValue || ""} />
                  <PhoneInput
                    id="purchase-phone"
                    required
                    defaultCountry="UG"
                    international
                    withCountryCallingCode
                    value={phoneValue}
                    onChange={setPhoneValue}
                    className="flex h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm focus-within:ring-2 focus-within:ring-ring/30 [&_.PhoneInputInput]:min-w-0 [&_.PhoneInputInput]:bg-transparent [&_.PhoneInputInput]:outline-none [&_.PhoneInputCountrySelect]:bg-background"
                  />
                </div>
              </div>
            </section>
            <section
              aria-labelledby="confirmation-heading"
              className="space-y-6"
            >
              <h2
                id="confirmation-heading"
                className="border-b border-border/40 pb-3 text-base font-medium"
              >
                2. Confirm your request
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                You&apos;ll receive your
                invoice and payment options after confirming your request.
              </p>
              <label className="block text-xs font-medium">
                Preferred contact method
                <select
                  name="preferredContactMethod"
                  defaultValue="whatsapp"
                  className={inputClass}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="phone">Phone</option>
                  <option value="email">Email</option>
                </select>
              </label>
              <label className="block text-xs font-medium">
                Anything we should know? (optional)
                <textarea
                  name="customerNote"
                  maxLength={2000}
                  rows={3}
                  className={`${inputClass} h-auto py-3`}
                />
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/40 bg-card p-4 text-xs leading-6 text-muted-foreground">
                <input
                  type="checkbox"
                  name="acceptTerms"
                  value="true"
                  required
                  className="mt-1 size-4 shrink-0 accent-brand-primary"
                />
                <span>
                  I understand this purchase covers the selected architectural
                  design package. Site adaptation, statutory approvals and
                  additional professional services are separate unless
                  explicitly included.
                </span>
              </label>
              {state.error && (
                <p
                  role="alert"
                  className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
                >
                  {state.error}
                </p>
              )}
              <Button
                type="submit"
                disabled={pending}
                className="h-12 w-full justify-between rounded-xl"
              >
                {pending ? "Confirming request…" : "Confirm purchase request"}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
              <p className="text-xs leading-6 text-muted-foreground">
                After confirming, you can leave without paying and return
                through{" "}
                <Link
                  href="/account/designs"
                  className="underline underline-offset-4"
                >
                  My designs
                </Link>{" "}
                at any time.
              </p>
            </section>
          </div>
          <aside
            aria-labelledby="summary-heading"
            className="row-start-1 min-w-0 rounded-2xl border border-border/80 bg-card lg:sticky lg:top-28 lg:col-start-2"
          >
            <div className="p-6">
              <div className="flex items-center justify-between">
                <h2
                  id="summary-heading"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Order summary
                </h2>
                <ShieldCheck
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <h3 className="mt-4 break-words text-xl font-medium tracking-tight">
                {design.title}
              </h3>
              {design.code && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {design.code}
                </p>
              )}
              <div className="mt-6 space-y-4 border-t border-border/40 pt-5">
                <p className="text-sm font-semibold">{selectedPackage.name}</p>
                {selectedPackage.description && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {selectedPackage.description}
                  </p>
                )}
                <ul className="space-y-2.5">
                  {selectedPackage.includes.map((item, index) => (
                    <li key={index} className="flex gap-2 text-xs leading-5">
                      <Check
                        className="mt-1 size-3 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="rounded-b-2xl border-t border-border/60 bg-muted/40 p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="text-sm">Total</span>
                <span className="text-2xl font-semibold tracking-tight tabular-nums">
                  UGX {selectedPackage.price.toLocaleString("en-UG")}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                One-time purchase · Payment verified by Calacot
              </p>
              <Link
                href={`/architecture/designs/${encodeURIComponent(design.slug)}`}
                className="mt-5 inline-block text-xs text-muted-foreground underline underline-offset-4"
              >
                Change selected package
              </Link>
            </div>
          </aside>
        </form>
      </div>
    </main>
  );
}
