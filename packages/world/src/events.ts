import { z } from 'zod';
import type { PaginationOptions } from './shared.js';

// Event type enum
export const EventTypeSchema = z.enum([
  'step_completed',
  'step_failed',
  'step_retrying',
  'step_started',
  'webhook_created',
  'webhook_request',
  'webhook_disposed',
  'workflow_completed',
  'workflow_failed',
  'workflow_started',
]);

// Base event schema with common properties
const BaseEventSchema = z.object({
  eventType: EventTypeSchema,
  correlationId: z.string().optional(),
});

// Event schemas (shared between creation requests and server responses)
const StepCompletedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('step_completed'),
  correlationId: z.string(),
  eventData: z.object({
    result: z.any(),
  }),
});

const StepFailedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('step_failed'),
  correlationId: z.string(),
  eventData: z.object({
    error: z.any(),
    stack: z.string().optional(),
    fatal: z.boolean().optional(),
  }),
});

// TODO: this is not actually used anywhere yet, we could remove it
// on client and server if needed
const StepRetryingEventSchema = BaseEventSchema.extend({
  eventType: z.literal('step_retrying'),
  correlationId: z.string(),
  eventData: z.object({
    error: z.any(),
    attempt: z.number().min(1),
  }),
});

const StepStartedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('step_started'),
  correlationId: z.string(),
});

const WebhookCreatedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('webhook_created'),
  correlationId: z.string(),
});

const WebhookRequestEventSchema = BaseEventSchema.extend({
  eventType: z.literal('webhook_request'),
  correlationId: z.string(),
  eventData: z.object({
    request: z.any(), // Serialized Request object
  }),
});

// TODO: not used yet
const WebhookDisposedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('webhook_disposed'),
  correlationId: z.string(),
});

// TODO: not used yet
const WorkflowCompletedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('workflow_completed'),
});

// TODO: not used yet
const WorkflowFailedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('workflow_failed'),
  eventData: z.object({
    error: z.any(),
  }),
});

// TODO: not used yet
const WorkflowStartedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('workflow_started'),
});

// Discriminated union (used for both creation requests and server responses)
export const CreateEventSchema = z.discriminatedUnion('eventType', [
  StepCompletedEventSchema,
  StepFailedEventSchema,
  StepRetryingEventSchema,
  StepStartedEventSchema,
  WebhookCreatedEventSchema,
  WebhookRequestEventSchema,
  WebhookDisposedEventSchema,
  WorkflowCompletedEventSchema,
  WorkflowFailedEventSchema,
  WorkflowStartedEventSchema,
]);

// Server response include runId, eventId, and createdAt
export const EventSchema = CreateEventSchema.and(
  z.object({
    runId: z.string(),
    eventId: z.string(),
    createdAt: z.coerce.date(),
  })
);

// Inferred types
export type Event = z.infer<typeof EventSchema>;
export type CreateEventRequest = z.infer<typeof CreateEventSchema>;
export type WebhookRequestEvent = z.infer<typeof WebhookRequestEventSchema>;

export interface ListEventsParams {
  runId: string;
  pagination?: PaginationOptions;
}
