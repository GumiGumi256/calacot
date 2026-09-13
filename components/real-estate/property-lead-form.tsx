"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";

import { submitPropertyLead } from "@/app/list-property/actions";
import {
  PROPERTY_TYPES,
  propertyLeadSchema,
  type PropertyLeadValues,
} from "@/lib/property-lead-schema";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const inputClass = "w-full min-w-0";


const mutedClass =
  "text-brand-black/65 dark:text-brand-white/65";

type Props = {
  initialType: PropertyLeadValues["submissionType"];
};

export function PropertyLeadForm({ initialType }: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState("");

  const successRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);

  const form = useForm<PropertyLeadValues>({
    resolver: zodResolver(propertyLeadSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: {
      submissionType: initialType,
      propertyType: "",
      location: "",
      details: "",
      fullName: "",
      phone: "",
      email: "",
    },
  });

  const {
    register,
    control,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = form;

  useEffect(() => {
    if (submitted) {
      successRef.current?.focus();
    }
  }, [submitted]);

  async function onSubmit(values: PropertyLeadValues) {
    if (submittingRef.current) return;

    submittingRef.current = true;
    setServerError("");

    try {
      const result = await submitPropertyLead(values);

      if (result.success) {
        setSubmitted(true);
        return;
      }

      setServerError(result.message);

      let firstError: keyof PropertyLeadValues | undefined;

      for (const name of Object.keys(result.errors ?? {}) as Array<
        keyof PropertyLeadValues
      >) {
        const message = result.errors?.[name]?.[0];

        if (message) {
          setError(name, {
            type: "server",
            message,
          });

          firstError ??= name;
        }
      }

      requestAnimationFrame(() => {
        if (firstError) {
          setFocus(firstError);
        } else {
          errorRef.current?.focus();
        }
      });
    } catch {
      setServerError(
        "We couldn’t confirm your submission. Your details are still here—please try again.",
      );

      requestAnimationFrame(() => {
        errorRef.current?.focus();
      });
    } finally {
      submittingRef.current = false;
    }
  }

  function renderInput(
    name: "location" | "fullName" | "phone" | "email",
    label: string,
    props: ComponentProps<typeof Input> = {},
    description?: string,
  ) {
    const error = errors[name];

    return (
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={name}>{label}</FieldLabel>

        <Input
          {...register(name)}
          {...props}
          id={name}
          className={inputClass}
          aria-invalid={Boolean(error)}
          aria-describedby={
            [
              description && `${name}-description`,
              error && `${name}-error`,
            ]
              .filter(Boolean)
              .join(" ") || undefined
          }
        />

        {description && (
          <FieldDescription
            id={`${name}-description`}
            className={mutedClass}
          >
            {description}
          </FieldDescription>
        )}

        {error && (
          <FieldError id={`${name}-error`} errors={[error]} />
        )}
      </Field>
    );
  }

  function renderSelect(
    name: "submissionType" | "propertyType",
    label: string,
    options: readonly { value: string; label: string }[],
  ) {
    return (
      <Controller
        name={name}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={name}>{label}</FieldLabel>

            <Select
              name={field.name}
              value={field.value}
              onValueChange={field.onChange}
              disabled={isSubmitting}
            >
              <SelectTrigger
                ref={field.ref}
                id={name}
                onBlur={field.onBlur}
                className={inputClass}
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? `${name}-error` : undefined
                }
              >
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>

              <SelectContent
                
                className="w-[var(--radix-select-trigger-width)] min-w-0 bg-brand-white text-brand-black dark:bg-brand-black dark:text-brand-white"
              >
                {options.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="min-h-10 focus:bg-brand-primary/15 focus:text-brand-black dark:focus:text-brand-white"
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {fieldState.invalid && (
              <FieldError
                id={`${name}-error`}
                errors={[fieldState.error]}
              />
            )}
          </Field>
        )}
      />
    );
  }

  if (submitted) {
    return (
      <div className="py-6">
        <Check
          aria-hidden="true"
          className="mb-5 size-8 text-brand-black dark:text-brand-primary"
        />

        <h2
          ref={successRef}
          tabIndex={-1}
          className="font-serif outline-none section-heading"
        >
          Thank you for the introduction.
        </h2>

        <p className={`mt-4 max-w-lg text-base leading-7 ${mutedClass}`}>
          Your details have been received. Our team will contact you to
          discuss your property and the next steps.
        </p>

        <Link href="/" className={buttonVariants({ variant: "default", size: "lg", className: "mt-8" })}>
            Return to Calacot
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
      </div>
    );
  }

  return (
    <form
      noValidate
      aria-busy={isSubmitting}
      onSubmit={handleSubmit(onSubmit)}
    >
      <fieldset
        disabled={isSubmitting}
        className="min-w-0 disabled:opacity-70"
      >
        <legend className="sr-only">Property submission</legend>

        <FieldGroup className="gap-7">
          <div className="grid gap-6 md:grid-cols-2">
            {renderSelect("submissionType", "I’d like to submit", [
              {
                value: "individual",
                label: "An individual property",
              },
              {
                value: "development",
                label: "A development",
              },
            ])}

            {renderSelect(
              "propertyType",
              "Property type",
              PROPERTY_TYPES.map((value) => ({
                value,
                label: value,
              })),
            )}
          </div>

          {renderInput("location", "Property location", {
            required: true,
            maxLength: 160,
            placeholder: "Area, town or district",
          })}

          <Field data-invalid={Boolean(errors.details)}>
            <FieldLabel htmlFor="details">
              Tell us about the property (optional)
            </FieldLabel>

            <Textarea
              {...register("details")}
              id="details"
              rows={4}
              maxLength={2000}
              className={`${inputClass} min-h-28 resize-y py-3`}
              placeholder="You can include the asking price, size, available units or anything else you’d like us to know."
              aria-invalid={Boolean(errors.details)}
              aria-describedby={
                errors.details ? "details-error" : undefined
              }
            />

            {errors.details && (
              <FieldError
                id="details-error"
                errors={[errors.details]}
              />
            )}
          </Field>

          <div className="pt-2">
            <h2 className="text-lg font-semibold tracking-tight">
              Your contact details
            </h2>

            <p className={`mt-1 text-sm leading-6 ${mutedClass}`}>
              Tell us who to speak with about the property.
            </p>
          </div>

          <div className="grid items-start gap-6 md:grid-cols-2">
            {renderInput("fullName", "Your name", {
              required: true,
              autoComplete: "name",
              maxLength: 100,
              placeholder: "Full name",
            })}

            {renderInput(
              "phone",
              "Phone number",
              {
                required: true,
                type: "tel",
                inputMode: "tel",
                autoComplete: "tel",
                maxLength: 30,
                placeholder: "+256 772 123 456",
              },
              "Include your country code.",
            )}
          </div>

          {renderInput("email", "Email address (optional)", {
            type: "email",
            inputMode: "email",
            autoComplete: "email",
            maxLength: 254,
            placeholder: "you@example.com",
          })}
        </FieldGroup>

        <p className={`mt-6 text-xs leading-6 ${mutedClass}`}>
          We’ll use these details to contact you about your property.
          Submitting this form does not publish a listing.
        </p>

        {serverError && (
          <div
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="mt-4 text-sm leading-6 text-destructive outline-none"
          >
            {serverError}
          </div>
        )}

        <Button
          type="submit"
          disabled={isSubmitting}
          size="lg" className="mt-6 w-full sm:w-auto"
        >
          {isSubmitting ? (
            <>
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin motion-reduce:animate-none"
              />
              Submitting…
            </>
          ) : (
            <>
              Submit your details
              <ArrowRight aria-hidden="true" className="size-4" />
            </>
          )}
        </Button>
      </fieldset>

      <p role="status" className="sr-only">
        {isSubmitting ? "Saving your details. Please wait." : ""}
      </p>
    </form>
  );
}