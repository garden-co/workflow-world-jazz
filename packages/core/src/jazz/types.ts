import {
  co,
  Group,
  type RefsToResolve,
  type RefsToResolveStrict,
  type Resolved,
  z,
} from 'jazz-tools';
import { EventTypeSchema } from '../world/events.js';
import { WorkflowRunSchema } from '../world/runs.js';
import { StepSchema } from '../world/steps.js';
import { WebhookSchema } from '../world/webhooks.js';

export const JazzWorkflowRun = co.map({
  ...WorkflowRunSchema.omit({
    runId: true,
    input: true,
    output: true,
    executionContext: true,
  }).shape,
  input: z.array(z.json()),
  output: z.json().optional(),
  executionContext: co.record(z.string(), z.json()).optional(),
});

export type JazzWorkflowRun = co.loaded<typeof JazzWorkflowRun>;

export const JazzStep = co.map({
  ...StepSchema.omit({
    input: true,
    output: true,
  }).shape,
  input: z.array(z.json()),
  output: z.json().optional(),
});

export type JazzStep = co.loaded<typeof JazzStep>;

export const JazzEvent = co.map({
  runId: z.string(),
  eventType: EventTypeSchema,
  eventData: z.json(),
  correlationId: z.string().optional(),
  createdAt: z.date(),
});

export type JazzEvent = co.loaded<typeof JazzEvent>;

export const JazzWebhook = co.map({
  ...WebhookSchema.omit({
    searchParamsSchema: true,
    headersSchema: true,
    bodySchema: true,
  }).shape,
  searchParamsSchema: z.json().optional(),
  headersSchema: z.json().optional(),
  bodySchema: z.json().optional(),
});

export type JazzWebhook = co.loaded<typeof JazzWebhook>;

export const JazzStorageRoot = co.map({
  runs: co.list(JazzWorkflowRun),
  steps: co.record(z.string(), co.record(z.string(), JazzStep)),
  events: co.record(z.string(), co.list(JazzEvent)),
  webhooks: co.record(z.string(), JazzWebhook),
  streams: co.record(z.string(), co.fileStream()),
});

export type JazzStorageRoot = co.loaded<typeof JazzStorageRoot>;

export const JazzStorageAccount = co
  .account({
    profile: co.profile(),
    root: JazzStorageRoot,
  })
  .withMigration((account) => {
    if (!account.$jazz.has('root')) {
      const defaultGroup = Group.create();
      const runs = co.list(JazzWorkflowRun).create([], { owner: defaultGroup });
      const steps = co
        .record(z.string(), co.record(z.string(), JazzStep))
        .create({}, { owner: defaultGroup });
      const events = co
        .record(z.string(), co.list(JazzEvent))
        .create({}, { owner: defaultGroup });
      const webhooks = co
        .record(z.string(), JazzWebhook)
        .create({}, { owner: defaultGroup });
      const streams = co
        .record(z.string(), co.fileStream())
        .create({}, { owner: defaultGroup });
      account.$jazz.set('root', {
        runs,
        events,
        steps,
        webhooks,
        streams,
      });
    }
  });

export type JazzStorageAccount = co.loaded<typeof JazzStorageAccount>;

export type JazzStorageAccountResolver = <
  const R extends RefsToResolve<JazzStorageAccount>,
>(
  resolve: RefsToResolveStrict<JazzStorageAccount, R>
) => Promise<Resolved<JazzStorageAccount, R>>;
