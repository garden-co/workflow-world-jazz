import { co } from 'jazz-tools';
import { startWorker } from 'jazz-tools/worker';
import { JSONSchema7 } from 'json-schema';
import { z } from 'zod';
import {
  CreateEventRequest,
  Event,
  ListEventsParams,
} from '../world/events.js';
import type { Storage } from '../world/interfaces.js';
import type {
  CreateWorkflowRunRequest,
  UpdateWorkflowRunRequest,
  WorkflowRun,
} from '../world/runs.js';
import { ListWorkflowRunsParams } from '../world/runs.js';
import { PaginatedResponse } from '../world/shared.js';
import {
  CreateStepRequest,
  ListWorkflowRunStepsParams,
  Step,
  UpdateStepRequest,
} from '../world/steps.js';
import {
  CreateWebhookRequest,
  ListWebhooksByUrlParams,
  Webhook,
} from '../world/webhooks.js';
import {
  JazzEvent,
  JazzStep,
  JazzStorageAccount,
  JazzWebhook,
  JazzWorkflowRun,
} from './types.js';

export const createStorage = (
  workerPromise: Promise<
    Awaited<ReturnType<typeof startWorker<typeof JazzStorageAccount>>>['worker']
  >
): Storage => ({
  runs: {
    async create(data: CreateWorkflowRunRequest): Promise<WorkflowRun> {
      const worker = await workerPromise;

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
      worker.root!.runs!.$jazz.push(jwr);

      return toWorkflowRun(jwr);
    },

    async get(id: string): Promise<WorkflowRun> {
      await workerPromise;

      const jwr = await JazzWorkflowRun.load(id);
      if (!jwr) {
        throw new Error(`Workflow run ${id} not found`);
      }

      return toWorkflowRun(jwr);
    },

    async update(
      id: string,
      data: UpdateWorkflowRunRequest
    ): Promise<WorkflowRun> {
      await workerPromise;

      const jwr = await JazzWorkflowRun.load(id);
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
      const worker = await workerPromise;
      await worker.root!.$jazz.ensureLoaded({
        resolve: {
          runs: {
            $each: true,
          },
        },
      });

      const eligibleRuns = Array.from(worker.root!.runs!).filter(
        (jwr): jwr is JazzWorkflowRun => jwr !== null
      );
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
  },

  steps: {
    async create(runId: string, data: CreateStepRequest): Promise<Step> {
      const worker = await workerPromise;
      await worker.root!.$jazz.ensureLoaded({
        resolve: {
          steps: true,
        },
      });

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

      let steps = worker.root!.steps![runId];
      if (!steps) {
        steps = co
          .list(JazzStep)
          .create([], { owner: worker.root!.steps!.$jazz.owner });
        worker.root!.steps!.$jazz.set(runId, steps);
      }
      steps.$jazz.push(js);

      return toStep(js);
    },

    async get(runId: string, stepId: string): Promise<Step> {
      const worker = await workerPromise;
      await worker.root!.$jazz.ensureLoaded({
        resolve: {
          steps: true,
        },
      });
      const steps = worker.root!.steps![runId];
      if (!steps) {
        throw new Error(`Steps for run ${runId} not found`);
      }

      await worker.root!.$jazz.ensureLoaded({
        resolve: {
          steps: {
            [runId]: {
              $each: true,
            },
          },
        },
      });
      const js = steps.find((js) => js!.stepId === stepId);
      if (!js) {
        throw new Error(`Step ${stepId} in run ${runId} not found`);
      }

      return toStep(js);
    },

    async update(
      runId: string,
      stepId: string,
      data: UpdateStepRequest
    ): Promise<Step> {
      const worker = await workerPromise;
      await worker.root!.$jazz.ensureLoaded({
        resolve: {
          steps: {
            [runId]: {
              $each: true,
            },
          },
        },
      });

      const runs = worker.root!.steps![runId];
      if (!runs) {
        throw new Error(`Steps for run ${runId} not found`);
      }
      const js = runs.find((js) => js!.stepId === stepId);
      if (!js) {
        throw new Error(`Step ${stepId} in run ${runId} not found`);
      }

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
      const worker = await workerPromise;
      await worker.root!.$jazz.ensureLoaded({
        resolve: {
          steps: true,
        },
      });

      const steps = worker.root!.steps![params.runId];
      if (!steps) {
        return {
          data: [],
          cursor: null,
          hasMore: false,
        };
      }
      await worker.root!.$jazz.ensureLoaded({
        resolve: {
          steps: {
            [params.runId]: {
              $each: true,
            },
          },
        },
      });

      const stepsArray = Array.from(steps).filter(
        (js): js is JazzStep => js !== null
      );
      return paginateItems({
        items: stepsArray,
        cursor: params?.pagination?.cursor,
        limit: params?.pagination?.limit,
        findCursorIndex: (items, cursor) =>
          items.findIndex((js) => js.stepId === cursor),
        getItemId: (js) => js.stepId,
        transform: toStep,
      });
    },
  },

  events: {
    async create(runId: string, data: CreateEventRequest): Promise<Event> {
      const worker = await workerPromise;
      await worker.root!.$jazz.ensureLoaded({
        resolve: {
          events: true,
        },
      });

      const now = new Date();
      const je: JazzEvent = JazzEvent.create({
        runId,
        createdAt: now,
        ...(data as any),
      });

      let events = worker.root!.events![runId];
      if (!events) {
        events = co
          .list(JazzEvent)
          .create([], { owner: worker.root!.events!.$jazz.owner });
        worker.root!.events!.$jazz.set(runId, events);
      }
      events.$jazz.push(je);

      return toEvent(je);
    },

    async list(params: ListEventsParams): Promise<PaginatedResponse<Event>> {
      const worker = await workerPromise;
      await worker.root!.$jazz.ensureLoaded({
        resolve: {
          events: true,
        },
      });

      const events = worker.root!.events![params.runId];
      if (!events) {
        return {
          data: [],
          cursor: null,
          hasMore: false,
        };
      }
      await worker.root!.$jazz.ensureLoaded({
        resolve: {
          events: {
            [params.runId]: {
              $each: true,
            },
          },
        },
      });

      const eventsArray = Array.from(events).filter(
        (je): je is JazzEvent => je !== null
      );
      return paginateItems({
        items: eventsArray,
        cursor: params?.pagination?.cursor,
        limit: params?.pagination?.limit,
        findCursorIndex: (items, cursor) =>
          items.findIndex((je) => je.$jazz.id === cursor),
        getItemId: (je) => je.$jazz.id,
        transform: toEvent,
      });
    },
  },

  webhooks: {
    async create(runId: string, data: CreateWebhookRequest): Promise<Webhook> {
      const worker = await workerPromise;
      await worker.root!.$jazz.ensureLoaded({
        resolve: {
          webhooks: true,
        },
      });

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
        searchParamsSchema: data.searchParamsSchema as any,
        headersSchema: data.headersSchema as any,
        bodySchema: data.bodySchema as any,
      });
      worker.root!.webhooks!.$jazz.set(data.webhookId, jw);

      return toWebhook(jw);
    },

    async get(webhookId: string, _deploymentId: string): Promise<Webhook> {
      const worker = await workerPromise;

      await worker.root!.$jazz.ensureLoaded({
        resolve: {
          webhooks: {
            [webhookId]: true,
          },
        },
      });
      const jw = worker.root!.webhooks![webhookId];
      if (!jw) {
        throw new Error(`Webhook ${webhookId} not found`);
      }

      return toWebhook(jw);
    },

    async getByUrl(
      url: string,
      _deploymentId: string,
      params?: ListWebhooksByUrlParams
    ): Promise<PaginatedResponse<Webhook>> {
      const worker = await workerPromise;
      await worker.root!.$jazz.ensureLoaded({
        resolve: {
          webhooks: true,
        },
      });

      const eligibleWebhooks: JazzWebhook[] = [];

      const ids = Object.keys(worker.root!.webhooks!);
      for (const id of ids) {
        await worker.root!.webhooks!.$jazz.ensureLoaded({
          resolve: {
            [id]: true,
          },
        });

        const jw = worker.root!.webhooks![id];
        if (!jw) {
          console.warn(`Webhook ${id} is undefined`);
          continue;
        }

        if (jw!.url === url) {
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
      const worker = await workerPromise;

      try {
        await worker.root!.$jazz.ensureLoaded({
          resolve: {
            webhooks: {
              [webhookId]: true,
            },
          },
        });
      } catch (error) {
        throw new Error(`Webhook ${webhookId} not found`);
      }

      const jw = worker.root!.webhooks![webhookId];
      if (!jw) {
        throw new Error(`Webhook ${webhookId} not found`);
      }
      worker.root!.webhooks!.$jazz.delete(webhookId);

      return toWebhook(jw);
    },
  },
});

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
