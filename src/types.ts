import { co, Group, z } from 'jazz-tools';

/**
 * One run: its event log and its streams.
 *
 * The event log is the source of truth. Every entity the World reports (the
 * run, its steps, hooks and waits) is derived by replaying it. `status`,
 * `workflowName` and `createdAt` are copies kept so `runs.list` can filter
 * without replaying every run.
 */
export const JazzRun = co.map({
  runId: z.string(),
  workflowName: z.string(),
  status: z.string(),
  createdAt: z.date(),
  /** One encoded event per slot, slot 1 at index 0 (see `codec.ts`). */
  events: co.list(z.string()),
  streams: co.record(z.string(), co.fileStream()),
});

export type JazzRun = co.loaded<typeof JazzRun>;

export const JazzQueueMessage = co.map({
  /** Stable across redeliveries and reschedules of the same logical message. */
  messageId: z.string(),
  queueName: z.string(),
  /** CBOR-encoded payload, base64 (payloads carry binary data). */
  payload: z.string(),
  deploymentId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  /** Earliest delivery time, for `delaySeconds`. */
  notBefore: z.date().optional(),
  /** Delivery attempt this copy of the message represents. */
  attempt: z.number(),
  createdAt: z.date(),
  processedAt: z.date().optional(),
});

export type JazzQueueMessage = co.loaded<typeof JazzQueueMessage>;

export const JazzQueueMessages = co.list(JazzQueueMessage);

export const JazzQueue = co.map({
  name: z.string(),
  webhookUrl: z.string(),
  messages: JazzQueueMessages,
  /** idempotencyKey -> messageId, for deduplicating enqueues. */
  idempotencyKeys: co.record(z.string(), z.string()),
});

export type JazzQueue = co.loaded<typeof JazzQueue>;

/**
 * Everything the v5 World stores. Kept under its own key so it never
 * collides with data an older version of this package left on the account:
 * runs created by the 4.x World cannot be replayed by the v5 runtime.
 */
export const JazzWorldRoot = co.map({
  runs: co.record(z.string(), JazzRun),
  /** token -> `${runId} ${hookId}` for every hook that can still receive. */
  hookTokens: co.record(z.string(), z.string()),
  /** hookId -> runId for every hook that can still receive. */
  hookRuns: co.record(z.string(), z.string()),
  /** `${queueName} ${webhookUrl}` -> queue. */
  queues: co.record(z.string(), JazzQueue),
});

/** The World's root with its indexes loaded, as every caller uses it. */
export type JazzWorldRoot = co.loaded<
  typeof JazzWorldRoot,
  { runs: true; hookTokens: true; hookRuns: true; queues: true }
>;

export const JazzStorageRoot = co.map({
  workflowV5: JazzWorldRoot.optional(),
});

export const JazzStorageAccount = co
  .account({
    profile: co.profile(),
    root: JazzStorageRoot,
  })
  .withMigration(async (account) => {
    if (!account.$jazz.has('root')) {
      account.$jazz.set('root', JazzStorageRoot.create({}, Group.create()));
    }
    const { root } = await account.$jazz.ensureLoaded({
      resolve: { root: true },
    });
    if (!root.$jazz.has('workflowV5')) {
      const owner = root.$jazz.owner;
      root.$jazz.set(
        'workflowV5',
        JazzWorldRoot.create(
          {
            runs: co.record(z.string(), JazzRun).create({}, owner),
            hookTokens: co.record(z.string(), z.string()).create({}, owner),
            hookRuns: co.record(z.string(), z.string()).create({}, owner),
            queues: co.record(z.string(), JazzQueue).create({}, owner),
          },
          owner
        )
      );
    }
  });

export type JazzStorageAccount = co.loaded<typeof JazzStorageAccount>;
