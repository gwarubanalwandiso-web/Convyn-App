import { z } from 'zod';
export const registrationSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  mobile: z.string().regex(/^\+[1-9]\d{7,14}$/),
  password: z.string().min(12).max(128),
  consent: z.literal(true),
});
export const serviceRequestSchema = z.object({
  categoryId: z.uuid(),
  description: z.string().trim().min(20).max(5000),
  urgency: z.enum(['STANDARD', 'URGENT', 'EMERGENCY']),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  scheduledAt: z.iso.datetime().optional(),
});
export const bidSchema = z.object({
  requestId: z.uuid(),
  labour: z.number().int().nonnegative().safe(),
  callout: z.number().int().nonnegative().safe(),
  materials: z.number().int().nonnegative().safe(),
  arrivalMinutes: z.number().int().min(1).max(10080),
  expiresAt: z.iso.datetime(),
});
