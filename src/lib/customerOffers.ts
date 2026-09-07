import { z } from "zod";
import { catalogItemSchema } from "./pricingCatalog";
export const customerOfferSchema = z.object({
  prospectId: z.string().min(1),
  plan: catalogItemSchema,
  founding: z.boolean(),
  revoked: z.boolean(),
  approvedBy: z.string().email(),
  approvedAt: z.string(),
  reason: z.string().trim().min(3).max(500),
}).strict();
export type CustomerOffer = z.infer<typeof customerOfferSchema>;
