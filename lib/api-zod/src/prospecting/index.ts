import { z } from "zod/v4";

export const ProspectStatusSchema = z.enum([
  "new",
  "enriched",
  "review_needed",
  "qualified",
  "contacted",
  "rejected",
  "responded",
  "converted"
]);

export const ProspectErrorCategorySchema = z.enum([
  "network",
  "parsing",
  "not_found",
  "validation"
]);

export const RetryStrategySchema = z.enum([
  "exponential",
  "fixed",
  "none",
  "escalate"
]);

export const JobStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "paused",
  "human_review"
]);

export const ProspectContactInfoSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid E.164 phone number").optional().nullable(),
  email: z.string().email("Invalid email address").optional().nullable(),
  domain: z.string().url("Invalid domain URL").or(z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/, "Invalid domain format")).optional().nullable(),
});

export const SocialLinksSchema = z.record(z.string(), z.string().url());

export const IcpCriteriaSchema = z.record(z.string(), z.any());

export const ProspectingJobRequestSchema = z.object({
  query: z.string().min(1),
  location: z.string().optional(),
  limit: z.number().int().positive().max(1000).default(50),
  idempotencyKey: z.string().optional(),
  webhookUrl: z.string().url().optional(),
  icpCriteria: IcpCriteriaSchema.optional(),
});

export type ProspectStatus = z.infer<typeof ProspectStatusSchema>;
export type ProspectErrorCategory = z.infer<typeof ProspectErrorCategorySchema>;
export type RetryStrategy = z.infer<typeof RetryStrategySchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
export type ProspectContactInfo = z.infer<typeof ProspectContactInfoSchema>;
export type SocialLinks = z.infer<typeof SocialLinksSchema>;
export type IcpCriteria = z.infer<typeof IcpCriteriaSchema>;
export type ProspectingJobRequest = z.infer<typeof ProspectingJobRequestSchema>;
