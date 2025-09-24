import { type Account, co, Group, z } from 'jazz-tools';
import { startWorker } from 'jazz-tools/worker';
import type { AuthProvider, Storage, World } from '../world/interfaces.js';
import type { CreateWorkflowRunRequest, WorkflowRun } from '../world/runs.js';

export function createJazzWorld(): World {
  // TODO: this will become simpler once createJazzWorld can be async
  const workerPromise = startWorker({
    syncServer: `wss://cloud.jazz.tools/?key=${process.env.JAZZ_API_KEY}`,
  }).then(({ worker }) => worker);

  return {
    ...authImpl,
    ...storageImpl(workerPromise),
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
  runId: z.string(),
  deploymentId: z.string(),
  workflowName: z.string(),
  input: z.array(z.json()),
  executionContext: z.json(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  error: z.string().optional(),
  errorCode: z.string().optional(),
  startedAt: z.date().optional(), // TODO: inferrable
  completedAt: z.date().optional(), // TODO: inferrable
  createdAt: z.date(), // TODO: inferrable
  updatedAt: z.date(), // TODO: inferrable
});

const storageImpl = (workerPromise: Promise<Account>): Storage => ({
  runs: {
    create: async (data: CreateWorkflowRunRequest): Promise<WorkflowRun> => {
      // TODO: this will become simpler once createJazzWorld can be async
      const worker = await workerPromise;

      const runGroup = Group.create({
        owner: worker,
      });

      const workflow = JazzWorkflowRun.create(
        {
          ...data,
          input: data.input as any[], // everything should be JSON serializable
          executionContext: data.executionContext as any,
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          group: runGroup,
        }
      );

      return workflow;
    },

    get: async (id: string): Promise<WorkflowRun> => {
      const workflow = await JazzWorkflowRun.load(id);
      return workflow;
    },
  },
});
