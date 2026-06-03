"use client";

import React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ChevronDownIcon } from "lucide-react";

import { Field, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "../ui/button";
import { formatService } from "./start-project-form";
import Link from "next/link";

interface ScheduleCallFormProps {
  initialService?: string;
  onSubmit?: (data: ScheduleCallFormData) => void;
}

// Helper to validate phone number (digits count between 10 and 15)
const phoneSchema = z.string()
  .transform((val) => val.replace(/\D/g, "")) // strip non-digits
  .refine((digits) => digits.length >= 10 && digits.length <= 15, {
    message: "Phone number must have 10–15 digits",
  });

export const scheduleCallSchema = z.object({
  service: z.string().min(1, "Please select a service"),
  fullName: z.string().min(2, "Please enter your full name"),
  email: z.email("Please enter a valid email address"),
  phone: phoneSchema,
  projectOverview: z
    .string()
    .min(20, "Please provide at least 20 characters about your project")
    .max(500, "Project overview cannot exceed 500 characters"),
 date: z.date("Please select a date" )
  .min(new Date(new Date().setHours(0, 0, 0, 0)), "Please select a future date"),
  time: z.string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Please enter a valid time in HH:MM format")
    .min(1, "Please select a preferred time"),
});

export type ScheduleCallFormData = z.infer<typeof scheduleCallSchema>;

export default function ScheduleCallForm({
  initialService,
  onSubmit,
}: ScheduleCallFormProps) {
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

  const onValidSubmit = (data: ScheduleCallFormData) => {
    if (onSubmit) {
      onSubmit(data);
    } else {
      console.log("Form submitted:", data);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-8 md:px-0">
      <h1 className="text-4xl font-semibold tracking-tight">
        Schedule a Consultation
      </h1>
      <p className="mt-4 text-muted-foreground">
        Book a call with our team to discuss your project, goals, timeline, and next steps.
      </p>

      <form onSubmit={handleSubmit(onValidSubmit)} className="mt-8 grid w-full gap-8">
        {/* Service field */}
        {initialService ? (
          <Field>
            <FieldLabel>Selected Service</FieldLabel>
            <Input value={formatService(initialService)} readOnly />
            <input type="hidden" {...register("service")} value={initialService} />
          </Field>
        ) : (
          <Field>
            <FieldLabel>Service</FieldLabel>
            <Controller
              name="service"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a service" />
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

        {/* Name + Email row */}
        <div className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel>Full Name</FieldLabel>
            <Input {...register("fullName")} />
            {errors.fullName && (
              <p className="text-sm text-destructive">{errors.fullName.message}</p>
            )}
          </Field>
          <Field>
            <FieldLabel>Email</FieldLabel>
            <Input type="email" {...register("email")} />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </Field>
        </div>

        {/* Phone */}
        <Field>
          <FieldLabel>Phone Number</FieldLabel>
          <Input type="tel" {...register("phone")} />
          {errors.phone && (
            <p className="text-sm text-destructive">{errors.phone.message}</p>
          )}
        </Field>

        {/* Date + Time row */}
        <div className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel>Preferred Date</FieldLabel>
            <Controller
              name="date"
              control={control}
              render={({ field }) => (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between text-left font-normal"
                    >
                      {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                      <ChevronDownIcon className="ml-2 h-4 w-4" />
                    </Button>
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
            {errors.date && (
              <p className="text-sm text-destructive">{errors.date.message}</p>
            )}
          </Field>

          <Field>
            <FieldLabel>Preferred Time</FieldLabel>
            <Controller
              name="time"
              control={control}
              render={({ field }) => (
                <Input type="time" {...field} />
              )}
            />
            {errors.time && (
              <p className="text-sm text-destructive">{errors.time.message}</p>
            )}
          </Field>
        </div>

        {/* Project Overview */}
        <Field>
          <FieldLabel>Project Overview</FieldLabel>
          <Textarea {...register("projectOverview")} className="min-h-32" />
          {errors.projectOverview && (
            <p className="text-sm text-destructive">{errors.projectOverview.message}</p>
          )}
        </Field>
 <Field
              orientation="horizontal"
              className="flex  gap-4 justify-start items-center"
            >

  
        {/* Submit Button */}
        <Button type="submit" disabled={isSubmitting} >
          {isSubmitting ? "Scheduling..." : "Schedule Call"}
        </Button>
        <Link href={`/start-project?service=${initialService || ""}`} passHref >
          <Button variant="outline" type="button" >
            Start a Project Instead
          </Button>
        </Link>
</Field>
      </form>
    </div>
  );
}