import { co, Group, z } from 'jazz-tools';
import { startWorker } from 'jazz-tools/worker';
import type { AuthProvider, World } from '../world/interfaces.js';
import type {
  CreateWorkflowRunRequest,
  UpdateWorkflowRunRequest,
  WorkflowRun,
} from '../world/runs.js';
import { ListWorkflowRunsParams, WorkflowRunSchema } from '../world/runs.js';
import { PaginatedResponse } from '../world/shared.js';
import {
  CreateStepRequest,
  ListWorkflowRunStepsParams,
  Step,
  StepSchema,
  UpdateStepRequest,
} from '../world/steps.js';

interface JazzWorld extends World {
  done(): Promise<void>;
}

export function createJazzWorld(): JazzWorld {
  // TODO: this will become simpler once createJazzWorld can be async
  const workerPromise = (async () => {
    const { worker } = await startWorker({
      // syncServer: `wss://cloud.jazz.tools/?key=${process.env.JAZZ_API_KEY}`,
      syncServer: 'http://localhost:4201',
      AccountSchema: JazzStorageAccount,
    });

    await worker.$jazz.ensureLoaded({
      resolve: {
        root: {
          runs: true,
        },
      },
    });

    return worker;
  })();

  return {
    ...authImpl,
    ...storageImpl(workerPromise),
    done: async () => {
      const worker = await workerPromise;
      await worker.$jazz.waitForAllCoValuesSync();
    },
  };
}

const authImpl: AuthProvider = {
  getAuthInfo: async () => {
    return {
      ownerId: 'jazz-owner',
      projectId: 'jazz-project',
      environment: 'jazz',
      userId: 'jazz-user',
    };
  },

  checkHealth: async () => {
    return {
      success: true,
      data: { healthy: true },
      message: 'Jazz backend is healthy',
    };
  },
};

const JazzWorkflowRun = co.map({
  ...WorkflowRunSchema.omit({
    runId: true,
    input: true,
    output: true,
    executionContext: true,
  }).shape,
  executionContext: z.json(),
  input: z.array(z.json()),
  output: z.json().optional(),
});

type JazzWorkflowRun = co.loaded<typeof JazzWorkflowRun>;

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

const JazzStep = co.map({
  ...StepSchema.omit({ input: true, output: true }).shape,
  input: z.array(z.json()),
  output: z.json().optional(),
});

type JazzStep = co.loaded<typeof JazzStep>;

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

const JazzStorageRoot = co.map({
  runs: co.list(JazzWorkflowRun),
  steps: co.record(z.string(), co.list(JazzStep)),
});

type JazzStorageRoot = co.loaded<typeof JazzStorageRoot>;

const JazzStorageAccount = co
  .account({
    profile: co.profile(),
    root: JazzStorageRoot,
  })
  .withMigration((account) => {
    if (!account.$jazz.has('root')) {
      const defaultGroup = Group.create();
      const runs = co.list(JazzWorkflowRun).create([], { owner: defaultGroup });
      const steps = co
        .record(z.string(), co.list(JazzStep))
        .create({}, { owner: defaultGroup });
      account.$jazz.set('root', {
        runs,
        steps,
      });
    }
  });

const storageImpl = (
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
});

async function main() {
  const world = createJazzWorld();

  // const run = await world.runs.create({
  //   deploymentId: '123',
  //   workflowName: 'test',
  //   input: [],
  //   executionContext: {},
  // });
  // console.log(run);

  console.log('Listing runs:');
  const runs = await world.runs.list({
    pagination: {
      limit: 3,
      // cursor: 'co_zMn4y22CM6nGn9NGRTUiYKAKvWY',
    },
  });
  runs.data.forEach((run) => {
    console.log(run.runId);
  });
  console.log('cursor', runs.cursor);
  console.log('hasMore', runs.hasMore);
  console.log('\n');

  // const step = await world.steps.create(runs.data[0].runId, {
  //   stepId: '1',
  //   stepName: 'test',
  //   input: [],
  // });
  // console.log(step);

  console.log('Listing steps:');
  const steps = await world.steps.list({
    runId: runs.data[0].runId,
    pagination: {
      limit: 1,
    },
  });
  steps.data.forEach((step) => {
    console.log(step.stepId);
  });
  console.log('cursor', steps.cursor);
  console.log('hasMore', steps.hasMore);
  console.log('\n');

  await world.done();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
