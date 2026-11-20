"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon, ChevronDownIcon } from "lucide-react";

import { Field, FieldError, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button, buttonVariants } from "../ui/button";
import { formatService } from "./start-project-form";
import { createScheduledCallLead } from "@/app/actions/schedule-call";
import { toast } from "../ui/toast";
import { scheduleCallSchema, type ScheduleCallFormData } from "@/lib/validations/schedule-call";

interface ScheduleCallFormProps {
  initialService?: string;
  onSubmit?: (data: ScheduleCallFormData) => void;
}

const services = [
  { value: "real-estate", label: "Real Estate" },
  { value: "architecture", label: "Architecture" },
  { value: "painting", label: "Painting" },
  { value: "interior-design", label: "Interior Design" },
  { value: "calacot-tech", label: "Calacot Tech" },
];

/*
 * Schedule a consultation (Design System V1, public site).
 * Every label is linked to its control; invalid fields are marked aria-invalid and point at
 * their message; failures (including network errors) say what happened and keep the input.
 * Validation (scheduleCallSchema) and the server action are unchanged.
 */
export default function ScheduleCallForm({ initialService, onSubmit }: ScheduleCallFormProps) {
  const router = useRouter();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ScheduleCallFormData>({
    resolver: zodResolver(scheduleCallSchema),
    defaultValues: {
      service: initialService || "",
      fullName: "",
      email: "",
      phone: "",
      projectOverview: "",
      date: undefined,
      time: "12:00",
    },
    mode: "onChange",
  });

  const onValidSubmit = async (data: ScheduleCallFormData) => {
    if (onSubmit) {
      onSubmit(data);
      return;
    }
    try {
      const result = await createScheduledCallLead(data);
      if (result.success) {
        toast.add({
          title: "Call requested",
          description: "Thank you. Our team will contact you to confirm the time.",
          type: "success",
        });
        router.push("/thank-you?type=call");
      } else {
        toast.add({
          title: "We couldn't schedule your call",
          description: result.error || "Please check your details and try again. Nothing was sent.",
          type: "error",
          timeout: 0,
        });
      }
    } catch {
      toast.add({
        title: "Connection problem",
        description: "Your request didn't reach us. Check your connection and try again; your details are still here.",
        type: "error",
        timeout: 0,
      });
    }
  };

  // Accessible wiring for each field: invalid state + the id of its message.
  const a11y = (name: keyof ScheduleCallFormData) => ({
    id: `call-${name}`,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `call-${name}-error` : undefined,
  });
  const error = (name: keyof ScheduleCallFormData) =>
    errors[name] ? <FieldError id={`call-${name}-error`}>{errors[name]?.message as string}</FieldError> : null;

  return (
    <div className="mx-auto max-w-3xl px-2 md:px-0">
      <p className="type-eyebrow text-brand-primary-800 dark:text-brand-primary">Free consultation</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-brand-black dark:text-brand-white">
        Schedule a Consultation
      </h1>
      <p className="mt-4 text-brand-black-600 dark:text-brand-black-300">
        Book a call with our team to discuss your project, goals, timeline, and next steps.
      </p>

      <form onSubmit={handleSubmit(onValidSubmit)} noValidate className="mt-10 space-y-6">
        {initialService ? (
          <Field>
            <FieldLabel htmlFor="call-service-readonly">Selected service</FieldLabel>
            <Input id="call-service-readonly" value={formatService(initialService)} readOnly />
            <input type="hidden" {...register("service")} value={initialService} />
          </Field>
        ) : (
          <Field data-invalid={errors.service ? true : undefined}>
            <FieldLabel htmlFor="call-service">Service</FieldLabel>
            <Controller
              name="service"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger {...a11y("service")} className="w-full">
                    <SelectValue placeholder="Choose a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {error("service")}
          </Field>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <Field data-invalid={errors.fullName ? true : undefined}>
            <FieldLabel htmlFor="call-fullName">Full name</FieldLabel>
            <Input {...a11y("fullName")} autoComplete="name" {...register("fullName")} />
            {error("fullName")}
          </Field>
          <Field data-invalid={errors.email ? true : undefined}>
            <FieldLabel htmlFor="call-email">Email</FieldLabel>
            <Input {...a11y("email")} type="email" autoComplete="email" inputMode="email" {...register("email")} />
            {error("email")}
          </Field>
        </div>

        <Field data-invalid={errors.phone ? true : undefined}>
          <FieldLabel htmlFor="call-phone">Phone number</FieldLabel>
          <Input {...a11y("phone")} type="tel" autoComplete="tel" inputMode="tel" {...register("phone")} />
          {error("phone")}
        </Field>

        <div className="grid gap-6 md:grid-cols-2">
          <Field data-invalid={errors.date ? true : undefined}>
            <FieldLabel htmlFor="call-date">Preferred date</FieldLabel>
            <Controller
              name="date"
              control={control}
              render={({ field }) => (
                <Popover>
                  {/* The trigger renders as the button itself: no button nested in a button. */}
                  <PopoverTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        {...a11y("date")}
                        className="w-full justify-between rounded-(--control-radius) px-3.5 text-left font-normal shadow-none"
                      />
                    }
                  >
                    <span className="flex items-center gap-2">
                      <CalendarIcon aria-hidden className="text-brand-black-600 dark:text-brand-black-300" />
                      {field.value ? format(field.value, "PPP") : <span className="text-brand-black-600 dark:text-brand-black-300">Pick a date</span>}
                    </span>
                    <ChevronDownIcon aria-hidden className="h-4 w-4" />
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    />
                  </PopoverContent>
                </Popover>
              )}
            />
            {error("date")}
          </Field>

          <Field data-invalid={errors.time ? true : undefined}>
            <FieldLabel htmlFor="call-time">Preferred time</FieldLabel>
            <Controller
              name="time"
              control={control}
              render={({ field }) => <Input {...a11y("time")} type="time" {...field} />}
            />
            {error("time")}
          </Field>
        </div>

        <Field data-invalid={errors.projectOverview ? true : undefined}>
          <FieldLabel htmlFor="call-projectOverview">Project overview</FieldLabel>
          <Textarea {...a11y("projectOverview")} {...register("projectOverview")} className="min-h-32" />
          {error("projectOverview")}
        </Field>

        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
          <Button type="submit" size="lg" loading={isSubmitting}>
            {isSubmitting ? "Sending request…" : "Schedule call"}
          </Button>
          <Link
            href={`/start-project?service=${initialService || ""}`}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Start a project instead
          </Link>
        </div>
      </form>
    </div>
  );
}
