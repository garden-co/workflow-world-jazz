import type { JSONSchema7 } from 'json-schema';
import { z } from 'zod';

// Webhook schemas
export const WebhookSchema = z.object({
  runId: z.string(),
  webhookId: z.string(),
  ownerId: z.string(),
  projectId: z.string(),
  environment: z.string(),
  url: z.string().optional(),
  allowedMethods: z.array(z.string()),
  searchParamsSchema: z.record(z.string(), z.custom<JSONSchema7>()).optional(),
  headersSchema: z.record(z.string(), z.custom<JSONSchema7>()).optional(),
  bodySchema: z.custom<JSONSchema7>().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// Inferred types
export type Webhook = z.infer<typeof WebhookSchema>;

// Request types
export interface CreateWebhookRequest {
  webhookId: string;
  url?: string;
  allowedMethods?: string[];
  searchParamsSchema?: Record<string, JSONSchema7>;
  headersSchema?: Record<string, JSONSchema7>;
  bodySchema?: JSONSchema7;
}

export interface ListWebhooksByUrlParams {
  page?: number;
  limit?: number;
}
