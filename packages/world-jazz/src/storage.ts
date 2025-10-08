import type {
  CreateEventRequest,
  CreateStepRequest,
  CreateWebhookRequest,
  CreateWorkflowRunRequest,
  Event,
  ListEventsParams,
  ListWebhooksByUrlParams,
  ListWorkflowRunStepsParams,
  ListWorkflowRunsParams,
  PaginatedResponse,
  Step,
  Storage,
  UpdateStepRequest,
  UpdateWorkflowRunRequest,
  Webhook,
  WorkflowRun,
} from '@vercel/workflow-world';
import { co } from 'jazz-tools';
import type { JSONSchema7 } from 'json-schema';
import { z } from 'zod';
import {
  JazzEvent,
  JazzStep,
  type JazzStorageAccountResolver,
  JazzWebhook,
  JazzWorkflowRun,
} from './types.js';

export const createStorage = (
  ensureLoaded: JazzStorageAccountResolver
): Storage => ({
  steps: createStepStorage(ensureLoaded),
  events: createEventStorage(ensureLoaded),
  webhooks: createWebhookStorage(ensureLoaded),
  runs: createRunStorage(ensureLoaded),
});

export const createRunStorage = (
  ensureLoaded: JazzStorageAccountResolver
): Storage['runs'] => {
  const loadRuns = async () => {
    return (
      await ensureLoaded({
        root: {
          runs: true,
        },
      })
    ).root.runs;
  };

  return {
    async create(data: CreateWorkflowRunRequest): Promise<WorkflowRun> {
      const runs = await loadRuns();

      const now = new Date();
      const jwr = JazzWorkflowRun.create({
        ...data,
        input: data.input as z.core.util.JSONType[], // everything should be JSON serializable
        executionContext: data.executionContext as Record<
          string,
          z.core.util.JSONType
        >,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      });
      runs.$jazz.push(jwr);

      return toWorkflowRun(jwr);
    },

    async get(id: string): Promise<WorkflowRun> {
      // Needed because World creation is synchronous
      await ensureLoaded({});

      const jwr = await JazzWorkflowRun.load(id, {
        resolve: {
          executionContext: true,
        },
      });
      if (!jwr) {
        throw new Error(`Workflow run ${id} not found`);
      }

      return toWorkflowRun(jwr);
    },

    async update(
      id: string,
      data: UpdateWorkflowRunRequest
    ): Promise<WorkflowRun> {
      // Needed because World creation is synchronous
      await ensureLoaded({});

      const jwr = await JazzWorkflowRun.load(id, {
        resolve: {
          executionContext: true,
        },
      });
      if (!jwr) {
        throw new Error(`Workflow run ${id} not found`);
      }

      const now = new Date();
      jwr.$jazz.set('updatedAt', now);

      if (data.status !== undefined) {
        jwr.$jazz.set('status', data.status);
      }
      if (data.output !== undefined) {
        jwr.$jazz.set('output', data.output as z.core.util.JSONType);
      }
      if (data.error !== undefined) {
        jwr.$jazz.set('error', data.error);
      }
      if (data.errorCode !== undefined) {
        jwr.$jazz.set('errorCode', data.errorCode);
      }
      if (data.executionContext !== undefined) {
        jwr.$jazz.set(
          'executionContext',
          data.executionContext as Record<string, z.core.util.JSONType>
        );
      }

      if (data.status === 'running') {
        jwr.$jazz.set('startedAt', now);
      }
      if (
        data.status === 'completed' ||
        data.status === 'failed' ||
        data.status === 'cancelled'
      ) {
        jwr.$jazz.set('completedAt', now);
      }

      return toWorkflowRun(jwr);
    },

    async list(
      params?: ListWorkflowRunsParams
    ): Promise<PaginatedResponse<WorkflowRun>> {
      const shallowRuns = await loadRuns();
      const runs = await shallowRuns.$jazz.ensureLoaded({
        resolve: {
          $each: {
            executionContext: true,
          },
        },
      });

      const eligibleRuns = runs.filter((jwr) => jwr !== null);
      return paginateItems({
        items: eligibleRuns,
        cursor: params?.pagination?.cursor,
        limit: params?.pagination?.limit,
        findCursorIndex: (items, cursor) =>
          items.findIndex((jwr) => jwr.$jazz.id === cursor),
        getItemId: (jwr) => jwr.$jazz.id,
        transform: toWorkflowRun,
        filter: (jwr) => {
          // Filter by workflow name
          if (
            params?.workflowName &&
            jwr.workflowName !== params.workflowName
          ) {
            return false;
          }
          // Filter by status
          if (params?.status && jwr.status !== params.status) {
            return false;
          }
          return true;
        },
      });
    },

    async cancel(id: string): Promise<WorkflowRun> {
      return this.update(id, { status: 'cancelled' });
    },

    async pause(id: string): Promise<WorkflowRun> {
      return this.update(id, { status: 'paused' });
    },

    async resume(id: string): Promise<WorkflowRun> {
      return this.update(id, { status: 'running' });
    },
  };
};

export const createStepStorage = (
  ensureLoaded: JazzStorageAccountResolver
): Storage['steps'] => {
  const runStepsFactory = async (runId: string) => {
    const stepsByRunId = (
      await ensureLoaded({
        root: {
          steps: true,
        },
      })
    ).root.steps;

    // Steps for this run exists, but they're not loaded
    if (stepsByRunId[runId] === null) {
      // biome-ignore lint/style/noNonNullAssertion: it's null (vs. undefined) because it exists
      return (
        await stepsByRunId.$jazz.ensureLoaded({
          resolve: {
            [runId]: true,
          },
        })
      )[runId]!;
    }

    // Steps for this run do not exist
    if (stepsByRunId[runId] === undefined) {
      const runSteps = co.record(z.string(), JazzStep).create({});
      stepsByRunId.$jazz.set(runId, runSteps);
      return runSteps;
    }

    // Steps for this run exist and are loaded
    return stepsByRunId[runId];
  };

  const getRunStep = async (runId: string, stepId: string) => {
    const steps = await runStepsFactory(runId);
    if (steps[stepId] === undefined) {
      throw new Error(`Step ${stepId} in run ${runId} not found`);
    }
    return (
      steps[stepId] ??
      steps[stepId] ??
      // biome-ignore lint/style/noNonNullAssertion: it's null (vs. undefined) because it exists
      (
        await steps.$jazz.ensureLoaded({
          resolve: {
            [stepId]: true,
          },
        })
      )[stepId]!
    );
  };

  return {
    async create(runId: string, data: CreateStepRequest): Promise<Step> {
      const now = new Date();
      const js = JazzStep.create({
        ...data,
        runId,
        status: 'pending',
        input: data.input as z.core.util.JSONType[],
        attempt: 1,
        createdAt: now,
        updatedAt: now,
      });

      const steps = await runStepsFactory(runId);
      steps.$jazz.set(data.stepId, js);

      return toStep(js);
    },

    async get(runId: string, stepId: string): Promise<Step> {
      const js = await getRunStep(runId, stepId);
      return toStep(js);
    },

    async update(
      runId: string,
      stepId: string,
      data: UpdateStepRequest
    ): Promise<Step> {
      const js = await getRunStep(runId, stepId);

      const now = new Date();
      js.$jazz.set('updatedAt', now);

      if (data.status !== undefined) {
        js.$jazz.set('status', data.status);
      }
      if (data.output !== undefined) {
        js.$jazz.set('output', data.output as z.core.util.JSONType);
      }
      if (data.error !== undefined) {
        js.$jazz.set('error', data.error);
      }
      if (data.errorCode !== undefined) {
        js.$jazz.set('errorCode', data.errorCode);
      }

      if (data.status === 'running') {
        js.$jazz.set('startedAt', now);
      }
      if (data.status === 'completed' || data.status === 'failed') {
        js.$jazz.set('completedAt', now);
      }

      return toStep(js);
    },

    async list(
      params: ListWorkflowRunStepsParams
    ): Promise<PaginatedResponse<Step>> {
      const steps = await runStepsFactory(params.runId);
      const eligibleSteps = Object.values(steps).filter((js) => js !== null);
      return paginateItems({
        items: eligibleSteps,
        cursor: params?.pagination?.cursor,
        limit: params?.pagination?.limit,
        findCursorIndex: (items, cursor) =>
          items.findIndex((js) => js.stepId === cursor),
        getItemId: (js) => js.stepId,
        transform: toStep,
      });
    },
  };
};

export const createWebhookStorage = (
  ensureLoaded: JazzStorageAccountResolver
): Storage['webhooks'] => {
  const loadWebhooks = async () => {
    return (
      await ensureLoaded({
        root: {
          webhooks: true,
        },
      })
    ).root.webhooks;
  };

  return {
    async create(runId: string, data: CreateWebhookRequest): Promise<Webhook> {
      const now = new Date();
      const jw = JazzWebhook.create({
        runId,
        webhookId: data.webhookId,
        ownerId: 'jazz-owner',
        projectId: 'jazz-project',
        environment: 'jazz',
        allowedMethods: data.allowedMethods || [],
        createdAt: now,
        updatedAt: now,
        url: data.url,
        searchParamsSchema: data.searchParamsSchema as z.core.util.JSONType,
        headersSchema: data.headersSchema as z.core.util.JSONType,
        bodySchema: data.bodySchema as z.core.util.JSONType,
      });

      const webhooks = await loadWebhooks();
      webhooks.$jazz.set(data.webhookId, jw);

      return toWebhook(jw);
    },

    async get(webhookId: string, _deploymentId: string): Promise<Webhook> {
      const webhooks = await loadWebhooks();

      if (webhooks[webhookId] === undefined) {
        throw new Error(`Webhook ${webhookId} not found`);
      }

      const jw =
        webhooks[webhookId] ??
        // biome-ignore lint/style/noNonNullAssertion: it's null (vs. undefined) because it exists
        (
          await webhooks.$jazz.ensureLoaded({
            resolve: {
              [webhookId]: true,
            },
          })
        )[webhookId]!;

      return toWebhook(jw);
    },

    async getByUrl(
      url: string,
      _deploymentId: string,
      params?: ListWebhooksByUrlParams
    ): Promise<PaginatedResponse<Webhook>> {
      const webhooks = await loadWebhooks();

      const eligibleWebhooks: JazzWebhook[] = [];
      for (const webhookId of Object.keys(webhooks)) {
        // biome-ignore lint/style/noNonNullAssertion: the key exists so the resolved value will
        const jw = (
          await webhooks.$jazz.ensureLoaded({
            resolve: {
              [webhookId]: true,
            },
          })
        )[webhookId]!;

        if (jw.url === url) {
          eligibleWebhooks.push(jw);
        }
      }

      return paginateItems({
        items: eligibleWebhooks,
        limit: params?.limit,
        getItemId: (jw) => jw.webhookId,
        transform: toWebhook,
      });
    },

    async dispose(webhookId: string, _deploymentId: string): Promise<Webhook> {
      const webhook = await this.get(webhookId, _deploymentId);

      const webhooks = await loadWebhooks();
      webhooks.$jazz.delete(webhookId);

      return webhook;
    },
  };
};

export const createEventStorage = (
  ensureLoaded: JazzStorageAccountResolver
): Storage['events'] => {
  const runEventsFactory = async (runId: string) => {
    const eventsByRunId = (
      await ensureLoaded({
        root: {
          events: true,
        },
      })
    ).root.events;

    // Events for this run exists, but they're not loaded
    if (eventsByRunId[runId] === null) {
      // biome-ignore lint/style/noNonNullAssertion: it's null (vs. undefined) because it exists
      return (
        await eventsByRunId.$jazz.ensureLoaded({
          resolve: {
            [runId]: true,
          },
        })
      )[runId]!;
    }

    // Events for this run do not exist
    if (eventsByRunId[runId] === undefined) {
      const runEvents = co.list(JazzEvent).create([]);
      eventsByRunId.$jazz.set(runId, runEvents);
      return runEvents;
    }

    // Events for this run exist and are loaded
    return eventsByRunId[runId];
  };

  return {
    async create(runId: string, data: CreateEventRequest): Promise<Event> {
      const now = new Date();
      const je: JazzEvent = JazzEvent.create({
        runId,
        createdAt: now,
        // biome-ignore lint/suspicious/noExplicitAny: discriminatedUnion difficulties
        ...(data as any),
      });

      const events = await runEventsFactory(runId);
      events.$jazz.push(je);

      return toEvent(je);
    },

    async list(params: ListEventsParams): Promise<PaginatedResponse<Event>> {
      const events = await runEventsFactory(params.runId);
      const loadedEvents = await events.$jazz.ensureLoaded({
        resolve: {
          $each: true,
        },
      });
      const eligibleEvents = loadedEvents.filter((je) => je !== null);
      return paginateItems({
        items: eligibleEvents,
        cursor: params?.pagination?.cursor,
        limit: params?.pagination?.limit,
        findCursorIndex: (items, cursor) =>
          items.findIndex((je) => je.$jazz.id === cursor),
        getItemId: (je) => je.$jazz.id,
        transform: toEvent,
      });
    },
  };
};

function paginateItems<T, TItem>({
  items,
  cursor,
  limit,
  findCursorIndex,
  getItemId,
  transform,
  filter,
}: {
  items: TItem[];
  cursor?: string;
  limit?: number;
  findCursorIndex?: (items: TItem[], cursor: string) => number;
  getItemId: (item: TItem) => string;
  transform: (item: TItem) => T;
  filter?: (item: TItem) => boolean;
}): PaginatedResponse<T> {
  const eligibleItems: TItem[] = [];

  let startIndex = 0;
  if (cursor && findCursorIndex) {
    startIndex = findCursorIndex(items, cursor) + 1;
  }

  for (let i = startIndex; i < items.length; i++) {
    const item = items[i];
    if (!item) {
      console.warn(`Item ${i} is undefined`);
      continue;
    }

    // Apply filter if provided
    if (filter && !filter(item)) {
      continue;
    }

    eligibleItems.push(item);
  }

  const limitedItems = limit ? eligibleItems.slice(0, limit) : eligibleItems;
  const hasMore = limit ? eligibleItems.length > limit : false;
  const nextCursor = hasMore
    ? getItemId(limitedItems[limitedItems.length - 1])
    : null;

  return {
    data: limitedItems.map(transform),
    cursor: nextCursor,
    hasMore,
  };
}

function toWorkflowRun(jwr: JazzWorkflowRun): WorkflowRun {
  return {
    runId: jwr.$jazz.id,
    deploymentId: jwr.deploymentId,
    status: jwr.status,
    workflowName: jwr.workflowName,
    executionContext: jwr.executionContext as
      | Record<string, z.core.util.JSONType>
      | undefined,
    input: jwr.input as z.core.util.JSONType[],
    output: jwr.output,
    error: jwr.error,
    errorCode: jwr.errorCode,
    startedAt: jwr.startedAt,
    completedAt: jwr.completedAt,
    createdAt: jwr.createdAt,
    updatedAt: jwr.updatedAt,
  };
}

function toStep(js: JazzStep): Step {
  return {
    runId: js.runId,
    stepId: js.stepId,
    stepName: js.stepName,
    status: js.status,
    input: js.input,
    output: js.output,
    error: js.error,
    errorCode: js.errorCode,
    attempt: js.attempt,
    startedAt: js.startedAt,
    completedAt: js.completedAt,
    createdAt: js.createdAt,
    updatedAt: js.updatedAt,
  };
}

function toEvent(je: JazzEvent): Event {
  return {
    runId: je.runId,
    eventId: je.$jazz.id,
    eventType: je.eventType,
    eventData: je.eventData,
    correlationId: je.correlationId,
    createdAt: je.createdAt,
  } as Event;
}

function toWebhook(jw: JazzWebhook): Webhook {
  return {
    ...jw,
    searchParamsSchema: jw.searchParamsSchema as Record<string, JSONSchema7>,
    headersSchema: jw.headersSchema as Record<string, JSONSchema7>,
    bodySchema: jw.bodySchema as JSONSchema7,
  };
}
