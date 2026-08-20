import { z } from "zod";

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
  projectOverview: z
    .string()
    .min(20, "Please provide at least 20 characters about your project")
    .max(1000, "Project overview cannot exceed 1000 characters"),
});

export type StartProjectFormData = z.infer<typeof startProjectSchema>;