import { co } from 'jazz-tools';
import { startWorker } from 'jazz-tools/worker';
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
  JazzStep,
  JazzStorageAccount,
  JazzWebhook,
  JazzWorkflowRun,
} from './types.js';
import {
  CreateWebhookRequest,
  ListWebhooksByUrlParams,
  Webhook,
} from '../world/webhooks.js';
import { JSONSchema7 } from 'json-schema';

function toWorkflowRun(jwr: JazzWorkflowRun): WorkflowRun {
  return {
    runId: jwr.$jazz.id,
    deploymentId: jwr.deploymentId,
    status: jwr.status,
    workflowName: jwr.workflowName,
    executionContext: jwr.executionContext as Record<string, any> | undefined,
    input: jwr.input as any[],
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

function toWebhook(jw: JazzWebhook): Webhook {
  return {
    ...jw,
    searchParamsSchema: jw.searchParamsSchema as Record<string, JSONSchema7>,
    headersSchema: jw.headersSchema as Record<string, JSONSchema7>,
    bodySchema: jw.bodySchema as JSONSchema7,
  };
}

export const createStorage = (
  workerPromise: Promise<
    Awaited<ReturnType<typeof startWorker<typeof JazzStorageAccount>>>['worker']
  >
) /*: Storage*/ => ({
  runs: {
    async create(data: CreateWorkflowRunRequest): Promise<WorkflowRun> {
      const worker = await workerPromise;

      const now = new Date();
      const jwr = JazzWorkflowRun.create({
        ...data,
        input: data.input as any[], // everything should be JSON serializable
        executionContext: data.executionContext as any,
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
        jwr.$jazz.set('output', data.output as any);
      }
      if (data.error !== undefined) {
        jwr.$jazz.set('error', data.error);
      }
      if (data.errorCode !== undefined) {
        jwr.$jazz.set('errorCode', data.errorCode);
      }
      if (data.executionContext !== undefined) {
        jwr.$jazz.set('executionContext', data.executionContext);
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

      const eligibleJwrs: JazzWorkflowRun[] = [];

      let startIndex = 0;
      if (params?.pagination?.cursor) {
        startIndex =
          worker.root!.runs!.findIndex(
            (jwr) => jwr!.$jazz.id === params?.pagination?.cursor
          ) + 1;
      }
      for (let i = startIndex; i < worker.root!.runs!.length; i++) {
        const jwr = worker.root!.runs![i]!;
        if (!jwr) {
          console.warn(`Workflow run ${i} is undefined`);
          continue;
        }

        // Filter by workflow name
        if (params?.workflowName && jwr.workflowName !== params.workflowName) {
          continue;
        }

        // Filter by status
        if (params?.status && jwr.status !== params.status) {
          continue;
        }

        eligibleJwrs.push(jwr);
      }

      const limit = params?.pagination?.limit;
      const jwrs = limit ? eligibleJwrs.slice(0, limit) : eligibleJwrs;
      const hasMore = limit ? eligibleJwrs.length > limit : false;
      const nextCursor = hasMore ? jwrs[jwrs.length - 1].$jazz.id : null;

      return {
        data: jwrs.map(toWorkflowRun),
        cursor: nextCursor,
        hasMore,
      };
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
          steps: {
            [runId]: {
              $each: true,
            },
          },
        },
      });

      const now = new Date();
      const js = JazzStep.create({
        ...data,
        runId,
        status: 'pending',
        input: data.input as any[],
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
        js.$jazz.set('output', data.output as any);
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
          steps: {
            [params.runId]: {
              $each: true,
            },
          },
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

      const eligibleSteps: JazzStep[] = [];

      let startIndex = 0;
      if (params?.pagination?.cursor) {
        startIndex =
          steps.findIndex((js) => js!.stepId === params?.pagination?.cursor) +
          1;
      }

      for (let i = startIndex; i < steps.length; i++) {
        const js = steps[i]!;
        if (!js) {
          console.warn(`Step ${i} in run ${params.runId} is undefined`);
          continue;
        }

        eligibleSteps.push(js);
      }

      const limit = params?.pagination?.limit;
      const jss = limit ? eligibleSteps.slice(0, limit) : eligibleSteps;
      const hasMore = limit ? eligibleSteps.length > limit : false;
      const nextCursor = hasMore ? jss[jss.length - 1].stepId : null;

      return {
        data: jss.map(toStep),
        cursor: nextCursor,
        hasMore,
      };
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

      const limit = params?.limit;
      const jws = limit ? eligibleWebhooks.slice(0, limit) : eligibleWebhooks;
      const hasMore = limit ? eligibleWebhooks.length > limit : false;
      const nextCursor = hasMore ? jws[jws.length - 1].webhookId : null;

      return {
        data: jws.map(toWebhook),
        cursor: nextCursor,
        hasMore,
      };
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
