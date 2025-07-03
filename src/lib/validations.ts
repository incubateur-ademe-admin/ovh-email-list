import { z } from "zod";

export const emailSchema = z.string().min(1, "L'adresse email est requise").email("Format d'adresse email invalide");

export const emailListSchema = z
  .string()
  .min(1, "Au moins une adresse email de destination est requise")
  .refine((value) => {
    const emails = value
      .split(/[,;\n]/)
      .map((email) => email.trim())
      .filter((email) => email.length > 0);
    return emails.length > 0;
  }, "Au moins une adresse email de destination est requise")
  .refine((value) => {
    const emails = value
      .split(/[,;\n]/)
      .map((email) => email.trim())
      .filter((email) => email.length > 0);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emails.every((email) => emailRegex.test(email));
  }, "Une ou plusieurs adresses email sont invalides");

export const createRedirectionSchema = z.object({
  from: emailSchema,
  toList: emailListSchema,
});

export const addToExistingSchema = z.object({
  toList: emailListSchema,
});

export type CreateRedirectionForm = z.infer<typeof createRedirectionSchema>
export type AddToExistingForm = z.infer<typeof addToExistingSchema>
