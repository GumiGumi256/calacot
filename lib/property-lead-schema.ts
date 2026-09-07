import { z } from "zod";

export const PROPERTY_TYPES = [
  "House",
  "Apartment",
  "Villa",
  "Land",
  "Commercial property",
  "Residential development",
  "Commercial development",
  "Mixed-use development",
  "Other",
] as const;

export const propertyLeadSchema = z.object({
  submissionType: z.enum(["individual", "development"]),

  propertyType: z
    .string()
    .trim()
    .min(1, "Select a property type.")
    .refine(
      (value) =>
        (PROPERTY_TYPES as readonly string[]).includes(value),
      "Select a valid property type.",
    ),

  location: z
    .string()
    .trim()
    .min(2, "Enter the property location.")
    .max(160, "Keep the location under 160 characters."),

  details: z
    .string()
    .trim()
    .max(2000, "Keep your description under 2,000 characters."),

  fullName: z
    .string()
    .trim()
    .min(2, "Enter your name.")
    .max(100, "Keep your name under 100 characters."),

  phone: z
    .string()
    .trim()
    .max(30, "Enter a valid phone number.")
    .refine(
      (value) =>
        /^\+[1-9]\d{7,14}$/.test(value.replace(/[\s()-]/g, "")),
      "Include your country code, for example +256 772 123 456.",
    ),

  email: z
    .string()
    .trim()
    .max(254, "Enter a valid email address.")
    .refine(
      (value) => value === "" || z.string().email().safeParse(value).success,
      "Enter a valid email address.",
    ),
});

export type PropertyLeadValues = z.infer<typeof propertyLeadSchema>;

export type PropertyLeadResult =
  | { success: true }
  | {
      success: false;
      message: string;
      errors?: Partial<Record<keyof PropertyLeadValues, string[]>>;
    };