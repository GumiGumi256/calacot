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
import { createScheduledCallLead } from "@/app/actions/schedule-call";
import { toast } from "../ui/toast";
import { title } from "process";
import { useRouter } from "next/navigation";
import { scheduleCallSchema, type ScheduleCallFormData } from "@/lib/validations/schedule-call";


interface ScheduleCallFormProps {
  initialService?: string;
  onSubmit?: (data: ScheduleCallFormData) => void;
}



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
 const router = useRouter();
const onValidSubmit = async (data: ScheduleCallFormData) => {
  if (onSubmit) {
    onSubmit(data);
    return;
  }

  const result = await createScheduledCallLead(data);

  if (result.success) {
    toast.add({
      title: "Call Scheduled",
      description: "Your consultation has been scheduled successfully. We will contact you soon.",
      type: "success"
    });
    // Reset form state or navigate to a thank-you page here
      // Redirect to thank-you page upon success
      router.push("/thank-you?type=call");
  } else {
    toast.add({
      title: "Failed to Schedule Call",
      description: result.error || "Failed to schedule call. Please try again.",
      type: "destructive"
    });
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
                  <PopoverTrigger>
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