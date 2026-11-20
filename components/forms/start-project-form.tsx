"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlertIcon } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SERVICE_COPY } from "@/constants";
import { startProjectSchema, type StartProjectFormData } from "@/lib/validations/project";
import { createProjectLead } from "@/app/actions/start-project";
import { toast } from "../ui/toast";

interface StartProjectFormProps {
  initialService?: string;
  initialOverview?: string;
  onSubmit?: (data: StartProjectFormData) => void;
  onScheduleCall?: () => void;
}

const services = [
  { value: "real-estate", label: "Real Estate" },
  { value: "architecture", label: "Architecture" },
  { value: "painting", label: "Painting" },
  { value: "interior-design", label: "Interior Design" },
  { value: "calacot-tech", label: "Calacot Tech" },
];
const budgets = [
  { value: "under-5m", label: "Under UGX 5M" },
  { value: "5m-20m", label: "UGX 5M - 20M" },
  { value: "20m-100m", label: "UGX 20M - 100M" },
  { value: "100m-plus", label: "Above UGX 100M" },
];
const timelines = [
  { value: "immediately", label: "Immediately" },
  { value: "1-month", label: "Within 1 Month" },
  { value: "3-months", label: "Within 3 Months" },
  { value: "planning", label: "Just Planning" },
];

/*
 * Start a project (Design System V1, public site).
 * Every label is linked to its control; invalid fields are marked aria-invalid and point at
 * their message; server and connection failures are shown in place and keep what was typed.
 * Validation (startProjectSchema) and the server action are unchanged.
 */
export default function StartProjectForm({ initialService, initialOverview, onSubmit }: StartProjectFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const serviceData = SERVICE_COPY[initialService || ""];

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StartProjectFormData>({
    resolver: zodResolver(startProjectSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      service: initialService || "",
      projectLocation: "",
      estimatedBudget: "",
      timeline: "",
      projectOverview: initialOverview || "",
    },
    mode: "onChange",
  });

  const onValidSubmit = async (data: StartProjectFormData) => {
    setServerError(null);
    if (onSubmit) {
      onSubmit(data);
      return;
    }
    try {
      const result = await createProjectLead(data);
      if (result.success) {
        toast.add({
          title: "Project request sent",
          description: "Thank you. We'll review your project and get back to you shortly.",
          type: "success",
        });
        router.push("/thank-you?type=project");
      } else {
        setServerError(result.error || "We couldn't submit your project request. Please check your details and try again.");
      }
    } catch {
      setServerError("Your request didn't reach us. Check your connection and try again; your details are still here.");
    }
  };

  const a11y = (name: keyof StartProjectFormData) => ({
    id: `project-${name}`,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `project-${name}-error` : undefined,
  });
  const error = (name: keyof StartProjectFormData) =>
    errors[name] ? <FieldError id={`project-${name}-error`}>{errors[name]?.message as string}</FieldError> : null;
  const invalid = (name: keyof StartProjectFormData) => (errors[name] ? true : undefined);

  const choice = (name: "service" | "estimatedBudget" | "timeline", placeholder: string, options: { value: string; label: string }[]) => (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Select onValueChange={field.onChange} value={field.value}>
          <SelectTrigger {...a11y(name)} className="w-full">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );

  return (
    <div className="mx-auto w-full max-w-md md:max-w-2xl lg:max-w-4xl">
      <p className="type-eyebrow text-brand-primary-800 dark:text-brand-primary">Start a project</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-brand-black dark:text-brand-white">
        {initialService ? `Start Your ${formatService(initialService)} Project` : "Start Your Project"}
      </h1>
      <p className="mt-4 mb-10 max-w-2xl text-brand-black-600 dark:text-brand-black-300">
        {serviceData?.description ??
          "Whether you're building a new home, transforming an interior, refreshing a property with paint, developing software, or investing in real estate, we'd love to learn about your vision."}
      </p>

      {serverError && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg border border-destructive-border bg-destructive-soft p-4 text-sm text-destructive-text">
          <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>{serverError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onValidSubmit)} noValidate>
        <FieldGroup>
          <FieldSet>
            <FieldLegend>Your information</FieldLegend>
            <FieldDescription>Tell us a little about yourself. All fields marked * are required.</FieldDescription>
            <FieldGroup className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
              <Field data-invalid={invalid("fullName")}>
                <FieldLabel htmlFor="project-fullName">Full name *</FieldLabel>
                <Input {...a11y("fullName")} autoComplete="name" placeholder="John Doe" {...register("fullName")} />
                {error("fullName")}
              </Field>
              <Field data-invalid={invalid("email")}>
                <FieldLabel htmlFor="project-email">Email address *</FieldLabel>
                <Input {...a11y("email")} type="email" autoComplete="email" inputMode="email" placeholder="john@example.com" {...register("email")} />
                {error("email")}
              </Field>
              <Field data-invalid={invalid("phone")}>
                <FieldLabel htmlFor="project-phone">Phone number *</FieldLabel>
                <Input {...a11y("phone")} type="tel" autoComplete="tel" inputMode="tel" placeholder="+256 700 000 000" {...register("phone")} />
                {error("phone")}
              </Field>
            </FieldGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend>Service required</FieldLegend>
            <FieldDescription>Select the service you&apos;re interested in.</FieldDescription>
            {initialService ? (
              <Field>
                <input type="hidden" {...register("service")} value={initialService} />
                <FieldLabel htmlFor="project-service-readonly">Selected service</FieldLabel>
                <Input id="project-service-readonly" value={formatService(initialService)} readOnly />
              </Field>
            ) : (
              <Field data-invalid={invalid("service")}>
                <FieldLabel htmlFor="project-service">Service *</FieldLabel>
                {choice("service", "Select a service", services)}
                {error("service")}
              </Field>
            )}
          </FieldSet>

          <FieldSet>
            <FieldLegend>Project details</FieldLegend>
            <FieldGroup className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
              <Field data-invalid={invalid("projectLocation")}>
                <FieldLabel htmlFor="project-projectLocation">Project location *</FieldLabel>
                <Input {...a11y("projectLocation")} autoComplete="address-level2" placeholder="Kampala, Uganda" {...register("projectLocation")} />
                {error("projectLocation")}
              </Field>
              <Field data-invalid={invalid("estimatedBudget")}>
                <FieldLabel htmlFor="project-estimatedBudget">Estimated budget *</FieldLabel>
                {choice("estimatedBudget", "Select budget range", budgets)}
                {error("estimatedBudget")}
              </Field>
              <Field data-invalid={invalid("timeline")}>
                <FieldLabel htmlFor="project-timeline">Timeline *</FieldLabel>
                {choice("timeline", "When do you want to start?", timelines)}
                {error("timeline")}
              </Field>
            </FieldGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend>Tell us about your project</FieldLegend>
            <Field data-invalid={invalid("projectOverview")}>
              <FieldLabel htmlFor="project-projectOverview">Project brief *</FieldLabel>
              <Textarea
                {...a11y("projectOverview")}
                aria-describedby={errors.projectOverview ? "project-projectOverview-error project-brief-hint" : "project-brief-hint"}
                className="min-h-40 resize-none"
                placeholder="Describe your project, goals, style preferences, requirements, or any specific ideas you have..."
                {...register("projectOverview")}
              />
              {error("projectOverview")}
              <FieldDescription id="project-brief-hint">Minimum 20 characters, maximum 1000.</FieldDescription>
            </Field>
          </FieldSet>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="submit" size="lg" loading={isSubmitting}>
              {isSubmitting ? "Sending request…" : "Start my project"}
            </Button>
            <Link href={`/schedule-call?service=${initialService || ""}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
              Schedule a call instead
            </Link>
          </div>
        </FieldGroup>
      </form>
    </div>
  );
}

export function formatService(service?: string) {
  if (!service) return "";
  return service
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
