"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";

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
import { startProjectSchema, type StartProjectFormData } from "@/lib/validations/project";
// Import your new Server Action
import { createProjectLead } from "@/app/actions/start-project";
import { toast } from "../ui/toast";

interface StartProjectFormProps {
  initialService?: string;
  onSubmit?: (data: StartProjectFormData) => void;
  onScheduleCall?: () => void;
}

const phoneSchema = z
  .string()
  .transform((val) => val.replace(/\D/g, ""))
  .refine((digits) => digits.length >= 10 && digits.length <= 15, {
    message: "Please enter a valid phone number (10–15 digits)",
  });





export default function StartProjectForm({
  initialService,
  onSubmit,
  onScheduleCall,
}: StartProjectFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

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
      projectOverview: "",
    },
    mode: "onChange",
  });

  const onValidSubmit = async (data: StartProjectFormData) => {
    setServerError(null);

    // Allow custom handler prop override if provided
    if (onSubmit) {
      onSubmit(data);
      return;
    }

    // Call the Server Action
    const result = await createProjectLead(data);

    if (result.success) {
      toast.add({
        title: "Project Request Submitted",
        description: "Thank you for your submission! We'll review your project and get back to you shortly.",
      type: "success"
      });
      // Redirect to thank-you page upon success
      router.push("/thank-you?type=project");
    } else {
      setServerError(result.error || "Failed to submit project request.");
      toast.add({
        title: "Submission Failed",
        description: result.error || "Failed to submit project request. Please try again.",
        type: "destructive"
      });
    }
  };

  return (
    <div className="w-full max-w-md md:max-w-2xl lg:max-w-4xl mx-auto">
      {hasService ? (
        <h1 className="text-3xl font-bold">Start Your {formatService(initialService)} Project</h1>
      ) : (
        <h1 className="text-3xl font-bold">Start Your Project</h1>
      )}
      <p className="mt-4 max-w-2xl text-muted-foreground mb-10">
        {serviceData?.description ??
          "Whether you're building a new home, transforming an interior, refreshing a property with paint, developing software, or investing in real estate, we'd love to learn about your vision."}
      </p>

      {/* Display server-side submission errors if any */}
      {serverError && (
        <div className="mb-6 rounded-md bg-destructive/15 p-4 text-sm text-destructive">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onValidSubmit)}>
        <FieldGroup>
          {/* Information Section */}
          <FieldSet>
            <FieldLegend>Your Information</FieldLegend>
            <FieldDescription>Tell us a little about yourself.</FieldDescription>

            <FieldGroup className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
              <Field>
                <FieldLabel>Full Name *</FieldLabel>
                <Input {...register("fullName")} placeholder="John Doe" />
                {errors.fullName && (
                  <p className="text-sm text-destructive">{errors.fullName.message}</p>
                )}
              </Field>

              <Field>
                <FieldLabel>Email Address *</FieldLabel>
                <Input type="email" {...register("email")} placeholder="john@example.com" />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email.message}</p>
                )}
              </Field>

              <Field>
                <FieldLabel>Phone Number *</FieldLabel>
                <Input type="tel" {...register("phone")} placeholder="+256 700 000 000" />
                {errors.phone && (
                  <p className="text-sm text-destructive">{errors.phone.message}</p>
                )}
              </Field>
            </FieldGroup>
          </FieldSet>

          {/* Service Section */}
          <FieldSet>
            <FieldLegend>Service Required</FieldLegend>
            <FieldDescription>Select the service you&apos;re interested in.</FieldDescription>

            {initialService ? (
              <>
                <input type="hidden" {...register("service")} value={initialService} />
                <Field>
                  <FieldLabel>Selected Service</FieldLabel>
                  <Input value={formatService(initialService)} readOnly />
                </Field>
              </>
            ) : (
              <Field>
                <FieldLabel>Service *</FieldLabel>
                <Controller
                  name="service"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a service" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="real-estate">Real Estate</SelectItem>
                        <SelectItem value="architecture">Architecture</SelectItem>
                        <SelectItem value="painting">Painting</SelectItem>
                        <SelectItem value="interior-design">Interior Design</SelectItem>
                        <SelectItem value="software-development">Software Development</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.service && (
                  <p className="text-sm text-destructive">{errors.service.message}</p>
                )}
              </Field>
            )}
          </FieldSet>

          {/* Project Details Section */}
          <FieldSet>
            <FieldLegend>Project Details</FieldLegend>

            <FieldGroup className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
              <Field>
                <FieldLabel>Project Location *</FieldLabel>
                <Input {...register("projectLocation")} placeholder="Kampala, Uganda" />
                {errors.projectLocation && (
                  <p className="text-sm text-destructive">{errors.projectLocation.message}</p>
                )}
              </Field>

              <Field>
                <FieldLabel>Estimated Budget *</FieldLabel>
                <Controller
                  name="estimatedBudget"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select budget range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="under-5m">Under UGX 5M</SelectItem>
                        <SelectItem value="5m-20m">UGX 5M - 20M</SelectItem>
                        <SelectItem value="20m-100m">UGX 20M - 100M</SelectItem>
                        <SelectItem value="100m-plus">Above UGX 100M</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.estimatedBudget && (
                  <p className="text-sm text-destructive">{errors.estimatedBudget.message}</p>
                )}
              </Field>

              <Field>
                <FieldLabel>Timeline *</FieldLabel>
                <Controller
                  name="timeline"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="When do you want to start?" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="immediately">Immediately</SelectItem>
                        <SelectItem value="1-month">Within 1 Month</SelectItem>
                        <SelectItem value="3-months">Within 3 Months</SelectItem>
                        <SelectItem value="planning">Just Planning</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.timeline && (
                  <p className="text-sm text-destructive">{errors.timeline.message}</p>
                )}
              </Field>
            </FieldGroup>
          </FieldSet>

          {/* Project Brief Section */}
          <FieldSet>
            <FieldLegend>Tell Us About Your Project</FieldLegend>

            <Field>
              <FieldLabel>Project Brief *</FieldLabel>
              <Textarea
                className="min-h-40 resize-none"
                placeholder="Describe your project, goals, style preferences, requirements, or any specific ideas you have..."
                {...register("projectOverview")}
              />
              {errors.projectOverview && (
                <p className="text-sm text-destructive">{errors.projectOverview.message}</p>
              )}
              <p className="text-xs text-muted-foreground">Minimum 20 characters, maximum 1000.</p>
            </Field>
          </FieldSet>

          {/* Actions */}
          <Field orientation="horizontal" className="flex flex-wrap gap-4 justify-start items-center">
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
  );
}

export function formatService(service?: string) {
  if (!service) return "";
  return service
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}