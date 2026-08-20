import { z } from "zod";

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