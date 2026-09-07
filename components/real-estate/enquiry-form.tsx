"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Controller, useForm, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from "lucide-react";
import { submitEstateEnquiry } from "@/app/contact/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  defaultValues, DETAILS_FIELDS, enquirySchema, JOURNEYS, PROPERTY_TYPES, TIMELINES,
  type EnquiryField, type EnquiryIntent, type EnquiryValues,
} from "@/lib/enquiry-schema";

const controlClass = "min-h-12 rounded-md border-brand-black/15 bg-transparent px-3 text-base text-brand-black shadow-none placeholder:text-brand-black/40 focus-visible:border-brand-black/50 focus-visible:ring-brand-primary/30 dark:border-brand-white/20 dark:text-brand-white dark:placeholder:text-brand-white/40 dark:focus-visible:border-brand-white/50";
const primaryClass = "min-h-12 rounded-md bg-brand-primary px-6 text-sm font-semibold text-brand-black shadow-none hover:bg-brand-primary/85 focus-visible:ring-brand-primary/50";
const mutedClass = "text-brand-black/65 dark:text-brand-white/65";

export function EstateEnquiryForm({ initialIntent }: { initialIntent: EnquiryIntent }) {
  const form = useForm<EnquiryValues>({
    resolver: zodResolver(enquirySchema),
    defaultValues: defaultValues(initialIntent),
    mode: "onTouched",
    reValidateMode: "onChange",
    shouldUnregister: false,
    shouldFocusError: false,
  });
  const intent = useWatch({ control: form.control, name: "intent" });
  const contactMethod = useWatch({ control: form.control, name: "contactMethod" });
  const currency = useWatch({ control: form.control, name: "currency" });
  const notes = useWatch({ control: form.control, name: "notes" });
  const [step, setStep] = useState<1 | 2>(1);
  const [serverError, setServerError] = useState("");
  const [reference, setReference] = useState("");
  const [attemptedStep, setAttemptedStep] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const submitting = useRef(false);
  const request = useRef<{ key: string; id: string } | null>(null);
  const busy = form.formState.isSubmitting;
  const seller = intent === "sell-property";
  const { errors } = form.formState;

  useEffect(() => {
    if (mounted.current) titleRef.current?.focus();
    mounted.current = true;
  }, [step]);

  useEffect(() => {
    if (reference) successRef.current?.focus();
  }, [reference]);

  function focusField(name: EnquiryField) {
    requestAnimationFrame(() => form.setFocus(name));
  }

  function changeIntent(next: EnquiryIntent) {
    if (next === intent || busy) return;
    form.setValue("intent", next, { shouldDirty: true });
    // Preserve location and contact details; clear fields whose meaning changed.
    for (const name of ["propertyType", "budgetMin", "budgetMax", "askingPrice", "relationship"] as const) {
      form.setValue(name, "", { shouldDirty: true });
      form.clearErrors(name);
    }
    setAttemptedStep(false);
    setServerError("");
    // Keep the URL shareable without triggering a navigation that loses entries.
    const url = new URL(window.location.href);
    url.searchParams.set("intent", next);
    window.history.replaceState(null, "", url);
  }

  async function nextStep() {
    setAttemptedStep(true);
    const valid = await form.trigger([...DETAILS_FIELDS]);
    if (!valid) {
      const first = DETAILS_FIELDS.find((name) => form.getFieldState(name).invalid);
      if (first) focusField(first);
      return;
    }
    setServerError("");
    setStep(2);
  }

  function handleInvalid(invalid: FieldErrors<EnquiryValues>) {
    const firstDetail = DETAILS_FIELDS.find((name) => invalid[name]);
    if (firstDetail) {
      setStep(1);
      setAttemptedStep(true);
      focusField(firstDetail);
    } else {
      const firstContact = (["fullName", "contactMethod", "email", "phone"] as const).find((name) => invalid[name]);
      if (firstContact) focusField(firstContact);
    }
  }

  async function onSubmit(values: EnquiryValues) {
    if (submitting.current) return;
    submitting.current = true;
    setServerError("");
    try {
      // An unchanged retry retains its ID, including after an ambiguous network failure.
      const key = JSON.stringify(values);
      if (!request.current || request.current.key !== key) {
        request.current = { key, id: crypto.randomUUID() };
      }
      const result = await submitEstateEnquiry({ requestId: request.current.id, values });
      if (result.ok) {
        setReference(result.reference);
        return;
      }
      const names = Object.keys(result.fieldErrors ?? {}) as EnquiryField[];
      for (const name of names) {
        form.setError(name, { type: "server", message: result.fieldErrors?.[name] });
      }
      setServerError(result.message);
      const firstDetail = DETAILS_FIELDS.find((name) => names.includes(name));
      if (firstDetail) setStep(1);
      if (names.length) focusField(firstDetail ?? names[0]);
      else requestAnimationFrame(() => errorRef.current?.focus());
    } catch {
      setServerError("We couldn’t confirm your enquiry was saved. Your details are still here. Please try again.");
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      submitting.current = false;
    }
  }

  // Text inputs use register; controlled selects use Controller below.
  function textField(
    name: EnquiryField,
    label: string,
    props: ComponentProps<typeof Input> = {},
    help?: string,
  ) {
    const error = errors[name];
    return (
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={name} className="font-medium">{label}</FieldLabel>
        <Input {...form.register(name, { deps: name === "budgetMin" ? ["budgetMax"] : undefined })} {...props} id={name} className={controlClass}
          aria-invalid={Boolean(error)}
          aria-describedby={[help && `${name}-help`, error && `${name}-error`].filter(Boolean).join(" ") || undefined} />
        {help && <FieldDescription id={`${name}-help`} className={mutedClass}>{help}</FieldDescription>}
        {error && <FieldError id={`${name}-error`} errors={[error]} />}
      </Field>
    );
  }

  function selectField(
    name: EnquiryField,
    label: string,
    options: readonly { value: string; label: string }[],
    required = true,
  ) {
    const placeholder = options.find((option) => option.value === "")?.label
      ?? "Select an option";

    return (
      <Controller
        key={name}
        name={name}
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={name} className="font-medium">
              {label}
            </FieldLabel>

            <Select
              name={field.name}
              value={field.value}
              required={required}
              disabled={busy}
              onValueChange={(value) => {
                field.onChange(value);

                if (name === "contactMethod") {
                  if (value !== "email" && !form.getValues("email")) {
                    form.clearErrors("email");
                  }
                  if (value === "email" && !form.getValues("phone")) {
                    form.clearErrors("phone");
                  }
                }
              }}
            >
              <SelectTrigger
                ref={field.ref}
                id={name}
                onBlur={field.onBlur}
                aria-required={required}
                aria-invalid={fieldState.invalid}
                aria-describedby={fieldState.invalid ? `${name}-error` : undefined}
                className={`${controlClass} w-full min-w-0 text-left`}
              >
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>

              <SelectContent
              
                sideOffset={6}
                className="w-[var(--radix-select-trigger-width)] min-w-0 border-brand-black/10 bg-brand-white text-brand-black dark:border-brand-white/15 dark:bg-brand-black dark:text-brand-white"
              >
                {options.filter((option) => option.value !== "").map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="min-h-10 cursor-pointer focus:bg-brand-primary/15 focus:text-brand-black dark:focus:bg-brand-primary/15 dark:focus:text-brand-white"
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {fieldState.invalid && (
              <FieldError id={`${name}-error`} errors={[fieldState.error]} />
            )}
          </Field>
        )}
      />
    );
  }

  if (reference) {
    return (
      <div className="py-4 md:py-8">
        <Check aria-hidden="true" className="mb-6 size-8 text-brand-black dark:text-brand-primary" />
        <h2 ref={successRef} tabIndex={-1} className="font-serif text-3xl leading-tight outline-none md:text-4xl">Thank you. Your enquiry is with us.</h2>
        <p className={`mt-5 max-w-lg text-base leading-7 ${mutedClass}`}>
          Our team will review your details and contact you by {contactMethod === "email" ? "email" : contactMethod === "whatsapp" ? "WhatsApp" : "phone"} to discuss the next step.
        </p>
        <p className={`mt-5 text-sm leading-6 ${mutedClass}`}>Keep this reference for any follow-up:</p>
        <p className="mt-1 break-all font-mono text-xs leading-6">{reference}</p>
        <Button className={`mt-8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary ${primaryClass}`}><Link href="/">Return to Calacot </Link></Button>
      </div>
    );
  }

  return (
    <form noValidate aria-busy={busy} onSubmit={(event) => {
      if (step === 1) { event.preventDefault(); void nextStep(); }
      else void form.handleSubmit(onSubmit, handleInvalid)(event);
    }}>
      <div className="mb-7">
        <p className={`text-xs font-medium tracking-wide ${mutedClass}`} aria-live="polite">Step {step} of 2 · {step === 1 ? "Your property brief" : "Your contact details"}</p>
        <div role="progressbar" aria-label="Enquiry progress" aria-valuemin={0} aria-valuemax={2} aria-valuenow={step}
          aria-valuetext={`Step ${step} of 2`} className="mt-3 h-0.5 bg-brand-black/10 dark:bg-brand-white/15">
          <div className={`h-full bg-brand-primary transition-[width] motion-reduce:transition-none ${step === 1 ? "w-1/2" : "w-full"}`} />
        </div>
      </div>

      <h2 ref={titleRef} tabIndex={-1} className="font-serif text-2xl leading-tight outline-none md:text-3xl">
        {step === 1 ? "What do you have in mind?" : "How can we reach you?"}
      </h2>
      <p className={`mt-2 text-sm leading-6 ${mutedClass}`}>
        {step === 1 ? "A few details will help us understand what matters to you." : "Choose the way you would prefer us to get in touch."}
        {" "}Optional fields are marked.
      </p>

      <fieldset disabled={busy} className="mt-7 min-w-0 disabled:opacity-70">
        <legend className="sr-only">Property enquiry</legend>
        <div hidden={step !== 1}>
          <FieldGroup className="gap-6">
            <Field>
              <FieldLabel id="journey-label">I’d like to</FieldLabel>
              <div role="group" aria-labelledby="journey-label" className="flex flex-wrap gap-x-5 gap-y-2">
                {JOURNEYS.map((journey) => (
                  <button key={journey.value} type="button" aria-pressed={intent === journey.value}
                    onClick={() => changeIntent(journey.value)}
                    className={`min-h-11 text-sm underline-offset-8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary ${intent === journey.value ? "font-semibold underline decoration-brand-primary decoration-2" : "text-brand-black/55 hover:text-brand-black dark:text-brand-white/55 dark:hover:text-brand-white"}`}>
                    {journey.label}
                  </button>
                ))}
              </div>
            </Field>

            {selectField("propertyType", intent === "buy-land" ? "Intended use of the land" : "Property type", [
              { value: "", label: "Select an option" }, ...PROPERTY_TYPES[intent].map((value) => ({ value, label: value })),
            ])}
            {textField("location", seller ? "Property location" : "Preferred location", {
              required: true, maxLength: 160, placeholder: "Area, town or region", autoComplete: "off",
            }, seller ? "An area or neighbourhood is enough for this first conversation." : "You can include more than one area if you’re flexible.")}

            <div className="grid gap-6 sm:grid-cols-2">
              {selectField("timeline", seller ? "When would you like to sell?" : "When are you looking to buy?", TIMELINES.map((value) => ({ value, label: value })))}
              {selectField("currency", "Currency", [{ value: "UGX", label: "UGX — Ugandan shilling" }, { value: "USD", label: "USD — US dollar" }])}
            </div>

            {seller ? <>
              {textField("askingPrice", `Asking price in ${currency} (optional)`, { inputMode: "decimal", maxLength: 18, placeholder: "Amount without commas" }, "Leave this blank if you would like to discuss pricing.")}
              {selectField("relationship", "Your relationship to the property", [
                { value: "", label: "Select an option" }, { value: "owner", label: "I own the property" },
                { value: "representative", label: "I’m authorised to represent the owner" },
              ])}
            </> : <Field>
              <FieldLabel><span id="budget-label">Budget in {currency} (optional)</span></FieldLabel>
              <div role="group" aria-labelledby="budget-label" className="grid grid-cols-2 gap-4">
                {textField("budgetMin", "Minimum", { inputMode: "decimal", maxLength: 18, placeholder: "From" })}
                {textField("budgetMax", "Maximum", { inputMode: "decimal", maxLength: 18, placeholder: "Up to" })}
              </div>
              <FieldDescription className={mutedClass}>Use amounts without commas. Either end of the range can be left blank.</FieldDescription>
            </Field>}

            <Field data-invalid={Boolean(errors.notes)}>
              <FieldLabel htmlFor="notes">{seller ? "Anything we should know about the property?" : "What matters most to you?"} (optional)</FieldLabel>
              <Textarea {...form.register("notes")} id="notes" maxLength={2000} rows={4}
                className={`${controlClass} min-h-28 resize-y py-3`}
                placeholder={seller ? "Size, condition, access or other useful details…" : intent === "buy-land" ? "Approximate size, access and what you’d like to build…" : "Bedrooms, outdoor space, accessibility or other priorities…"}
                aria-invalid={Boolean(errors.notes)} aria-describedby={errors.notes ? "notes-count notes-error" : "notes-count"} />
              <FieldDescription id="notes-count" className={`text-right text-xs ${mutedClass}`}>{notes.length.toLocaleString()} / 2,000</FieldDescription>
              {errors.notes && <FieldError id="notes-error" errors={[errors.notes]} />}
            </Field>
          </FieldGroup>
          {attemptedStep && DETAILS_FIELDS.some((name) => errors[name]) && <p role="alert" className="mt-4 text-sm text-destructive">Check the highlighted fields to continue.</p>}
        </div>

        <div hidden={step !== 2}>
          <p className={`mb-6 text-sm leading-6 ${mutedClass}`}>
            {JOURNEYS.find((journey) => journey.value === intent)?.label} · {form.getValues("location")}
          </p>
          <FieldGroup className="gap-6">
            {textField("fullName", "Your name", { required: true, autoComplete: "name", maxLength: 100, placeholder: "Full name" })}
            {selectField("contactMethod", "Preferred contact method", [
              { value: "email", label: "Email" }, { value: "whatsapp", label: "WhatsApp" }, { value: "phone", label: "Phone call" },
            ])}
            {textField("email", `Email address${contactMethod === "email" ? "" : " (optional)"}`, {
              type: "email", required: contactMethod === "email", autoComplete: "email", inputMode: "email", maxLength: 254, placeholder: "you@example.com",
            })}
            {textField("phone", `Phone number${contactMethod === "email" ? " (optional)" : ""}`, {
              type: "tel", required: contactMethod !== "email", autoComplete: "tel", inputMode: "tel", maxLength: 40, placeholder: "+256 772 123 456",
            }, contactMethod === "whatsapp" ? "Use the number linked to your WhatsApp account, including its country code." : "Include your country code. International numbers are welcome.")}
          </FieldGroup>
          <p className={`mt-6 text-xs leading-6 ${mutedClass}`}>We’ll use these details to respond to your enquiry.</p>
        </div>

        {serverError && <div ref={errorRef} tabIndex={-1} role="alert" className="mt-6 text-sm leading-6 text-destructive outline-none">{serverError}</div>}

        <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
          {step === 2 ? <Button type="button" variant="ghost" onClick={() => { setStep(1); setServerError(""); }} className="min-h-12 px-0 hover:bg-transparent hover:opacity-70"><ArrowLeft aria-hidden="true" className="size-4" /> Back</Button> : <span className={`text-xs ${mutedClass}`}>Contact details come next.</span>}
          <Button type="submit" disabled={busy} className={primaryClass}>
            {busy ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> Sending enquiry…</> : step === 1 ? <>Continue <ArrowRight aria-hidden="true" className="size-4" /></> : <>Send enquiry <ArrowRight aria-hidden="true" className="size-4" /></>}
          </Button>
        </div>
      </fieldset>
      <p role="status" aria-live="polite" className="sr-only">{busy ? "Saving your enquiry. Please wait." : ""}</p>
    </form>
  );
}
