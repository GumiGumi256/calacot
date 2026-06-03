"use client";

import React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SERVICE_COPY } from "@/constants";
import Link from "next/link";

interface StartProjectFormProps {
  initialService?: string;
  onSubmit?: (data: StartProjectFormData) => void;
  onScheduleCall?: () => void;
}

// Phone validation: must contain 10-15 digits (non-digits stripped)
const phoneSchema = z
  .string()
  .transform((val) => val.replace(/\D/g, ""))
  .refine((digits) => digits.length >= 10 && digits.length <= 15, {
    message: "Please enter a valid phone number (10–15 digits)",
  });

export const startProjectSchema = z.object({
  fullName: z.string().min(2, "Please enter your full name"),
  email: z.email("Please enter a valid email address"),
  phone: phoneSchema,
  service: z.string().min(1, "Please select a service"),
  projectLocation: z.string().min(1, "Please enter your project location"),
  estimatedBudget: z.string().min(1, "Please select an estimated budget range"),
  timeline: z.string().min(1, "Please select your timeline"),
  projectBrief: z
    .string()
    .min(20, "Please provide at least 20 characters about your project")
    .max(1000, "Project brief cannot exceed 1000 characters"),
});

export type StartProjectFormData = z.infer<typeof startProjectSchema>;

export default function StartProjectForm({
  initialService,
  onSubmit,
  onScheduleCall,
}: StartProjectFormProps) {
  const hasService = Boolean(initialService);
  const serviceKey = initialService || "";
  const serviceData = SERVICE_COPY[serviceKey];

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
      projectBrief: "",
    },
    mode: "onChange",
  });

  const onValidSubmit = (data: StartProjectFormData) => {
    onSubmit?.(data);
  };

  return (
    <div className="w-full max-w-md md:max-w-2xl lg:max-w-4xl mx-auto">
      {hasService ? (
        <h1>Start Your {formatService(initialService)} Project</h1>
      ) : (
        <h1>Start Your Project</h1>
      )}
      <p className="mt-4 max-w-2xl text-muted-foreground mb-10">
        {serviceData?.description ??
          "Whether you're building a new home, transforming an interior, refreshing a property with paint, developing software, or investing in real estate, we'd love to learn about your vision."}
      </p>

      <div className="w-full max-w-md md:max-w-2xl lg:max-w-4xl mx-auto">
        <form onSubmit={handleSubmit(onValidSubmit)}>
          <FieldGroup>
            <FieldSet>
              <FieldLegend>Your Information</FieldLegend>
              <FieldDescription>
                Tell us a little about yourself.
              </FieldDescription>

              <FieldGroup className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
                <Field>
                  <FieldLabel>Full Name *</FieldLabel>
                  <Input {...register("fullName")} placeholder="John Doe" />
                  {errors.fullName && (
                    <p className="text-sm text-destructive">
                      {errors.fullName.message}
                    </p>
                  )}
                </Field>

                <Field>
                  <FieldLabel>Email Address *</FieldLabel>
                  <Input
                    type="email"
                    {...register("email")}
                    placeholder="john@example.com"
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">
                      {errors.email.message}
                    </p>
                  )}
                </Field>

                <Field>
                  <FieldLabel>Phone Number *</FieldLabel>
                  <Input
                    type="tel"
                    {...register("phone")}
                    placeholder="+256 700 000 000"
                  />
                  {errors.phone && (
                    <p className="text-sm text-destructive">
                      {errors.phone.message}
                    </p>
                  )}
                </Field>
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Service Required</FieldLegend>
              <FieldDescription>
                Select the service you&apos;re interested in.
              </FieldDescription>

              {initialService && (
                <>
                  <input
                    type="hidden"
                    {...register("service")}
                    value={initialService}
                  />
                  <Field>
                    <FieldLabel>Selected Service</FieldLabel>
                    <Input value={formatService(initialService)} readOnly />
                  </Field>
                </>
              )}

              {!initialService && (
                <Field>
                  <FieldLabel>Service *</FieldLabel>
                  <Controller
                    name="service"
                    control={control}
                    render={({ field }) => (
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a service" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="real-estate">
                            Real Estate
                          </SelectItem>
                          <SelectItem value="architecture">
                            Architecture
                          </SelectItem>
                          <SelectItem value="painting">Painting</SelectItem>
                          <SelectItem value="interior-design">
                            Interior Design
                          </SelectItem>
                          <SelectItem value="software-development">
                            Software Development
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.service && (
                    <p className="text-sm text-destructive">
                      {errors.service.message}
                    </p>
                  )}
                </Field>
              )}
            </FieldSet>

            <FieldSet>
              <FieldLegend>Project Details</FieldLegend>

              <FieldGroup className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
                <Field>
                  <FieldLabel>Project Location *</FieldLabel>
                  <Input
                    {...register("projectLocation")}
                    placeholder="Kampala, Uganda"
                  />
                  {errors.projectLocation && (
                    <p className="text-sm text-destructive">
                      {errors.projectLocation.message}
                    </p>
                  )}
                </Field>

                <Field>
                  <FieldLabel>Estimated Budget *</FieldLabel>
                  <Controller
                    name="estimatedBudget"
                    control={control}
                    render={({ field }) => (
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select budget range" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="under-5m">
                            Under UGX 5M
                          </SelectItem>
                          <SelectItem value="5m-20m">
                            UGX 5M - 20M
                          </SelectItem>
                          <SelectItem value="20m-100m">
                            UGX 20M - 100M
                          </SelectItem>
                          <SelectItem value="100m-plus">
                            Above UGX 100M
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.estimatedBudget && (
                    <p className="text-sm text-destructive">
                      {errors.estimatedBudget.message}
                    </p>
                  )}
                </Field>

                <Field>
                  <FieldLabel>Timeline *</FieldLabel>
                  <Controller
                    name="timeline"
                    control={control}
                    render={({ field }) => (
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="When do you want to start?" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="immediately">
                            Immediately
                          </SelectItem>
                          <SelectItem value="1-month">
                            Within 1 Month
                          </SelectItem>
                          <SelectItem value="3-months">
                            Within 3 Months
                          </SelectItem>
                          <SelectItem value="planning">
                            Just Planning
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.timeline && (
                    <p className="text-sm text-destructive">
                      {errors.timeline.message}
                    </p>
                  )}
                </Field>
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Tell Us About Your Project</FieldLegend>

              <Field>
                <FieldLabel>Project Brief *</FieldLabel>
                <Textarea
                  className="min-h-40 resize-none"
                  placeholder="Describe your project, goals, style preferences, requirements, or any specific ideas you have..."
                  {...register("projectBrief")}
                />
                {errors.projectBrief && (
                  <p className="text-sm text-destructive">
                    {errors.projectBrief.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Minimum 20 characters, maximum 1000.
                </p>
              </Field>
            </FieldSet>

            <Field
              orientation="horizontal"
              className="flex flex-wrap gap-4 justify-start items-center"
            >
              <Button type="submit" size="lg" disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Start My Project"}
              </Button>
<Link href={`/schedule-call?service=${initialService || ""}`} passHref>

              <Button
                variant="outline"
                type="button"
                onClick={() => onScheduleCall?.()}
              >
                Schedule a Call
              </Button>
</Link>
            </Field>
          </FieldGroup>
        </form>
      </div>
    </div>
  );
}

export function formatService(service?: string) {
  if (!service) return "";
  return service
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}