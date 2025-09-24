import { co, Group, z } from 'jazz-tools';
import { startWorker } from 'jazz-tools/worker';
import type { AuthProvider } from '../world/interfaces.js';
import type {
  CreateWorkflowRunRequest,
  UpdateWorkflowRunRequest,
  WorkflowRun,
} from '../world/runs.js';
import {
  ListWorkflowRunsParams,
  WorkflowRunStatusSchema,
} from '../world/runs.js';
import { PaginatedResponse } from '../world/shared.js';

// export function createJazzWorld(): World {
//   return {
//     ...authImpl,
//   };
// }

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
  // runId: z.string(),
  deploymentId: z.string(),
  workflowName: z.string(),
  input: z.array(z.json()),
  executionContext: z.json(),
  status: WorkflowRunStatusSchema,
  output: z.json().optional(),
  error: z.string().optional(),
  errorCode: z.string().optional(),
  startedAt: z.date().optional(), // TODO: inferrable
  completedAt: z.date().optional(), // TODO: inferrable
  createdAt: z.date(), // TODO: inferrable
  updatedAt: z.date(), // TODO: inferrable
});

type JazzWorkflowRun = co.loaded<typeof JazzWorkflowRun>;

const JazzStorageRoot = co.map({
  runs: co.list(JazzWorkflowRun),
});

type JazzStorageRoot = co.loaded<typeof JazzStorageRoot>;

const JazzStorageAccount = co
  .account({
    profile: co.profile(),
    root: JazzStorageRoot,
  })
  .withMigration((account) => {
    if (!account.$jazz.has('root')) {
      const defaultRunGroup = Group.create();
      const runs = co
        .list(JazzWorkflowRun)
        .create([], { owner: defaultRunGroup });
      account.$jazz.set('root', {
        runs,
      });
    }
  });

let _worker:
  | Awaited<ReturnType<typeof startWorker<typeof JazzStorageAccount>>>['worker']
  | undefined;

async function getJazzWorker() {
  if (!_worker) {
    ({ worker: _worker } = await startWorker({
      syncServer: 'http://localhost:4201',
      AccountSchema: JazzStorageAccount,
    }));
  }

  await _worker.$jazz.ensureLoaded({
    resolve: {
      root: {
        runs: true,
      },
    },
  });

  return _worker;
}

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

// const storageImpl: Storage = {
const storageImpl = {
  runs: {
    async create(data: CreateWorkflowRunRequest): Promise<WorkflowRun> {
      const worker = await getJazzWorker();

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
      await getJazzWorker();

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
      await getJazzWorker();

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

      return this.get(id);
    },

    async list(
      params?: ListWorkflowRunsParams
    ): Promise<PaginatedResponse<WorkflowRun>> {
      const worker = await getJazzWorker();
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
};

async function main() {
  // const run = await storageImpl.runs.create({
  //   deploymentId: '123',
  //   workflowName: 'test',
  //   input: [],
  //   executionContext: {},
  // });
  // console.log(run);

  const runs = await storageImpl.runs.list({
    pagination: {
      limit: 4,
      cursor: 'co_zMn4y22CM6nGn9NGRTUiYKAKvWY',
    },
  });
  runs.data.forEach((run) => {
    console.log(run.runId);
  });
  console.log('cursor', runs.cursor);
  console.log('hasMore', runs.hasMore);

  await (await getJazzWorker()).$jazz.waitForAllCoValuesSync();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
