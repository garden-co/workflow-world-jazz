import { co, z } from 'jazz-tools';
import type { AuthProvider, World } from '../world/interfaces.js';
import type { CreateWorkflowRunRequest, WorkflowRun } from '../world/runs.js';

export function createJazzWorld(): World {
  return {
    ...authImpl,
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

const storageImpl: Storage = {
  runs: {
    create: async (data: CreateWorkflowRunRequest): Promise<WorkflowRun> => {
      const workflow = JazzWorkflowRun.create({
        ...data,
        input: data.input as any[], // everything should be JSON serializable
        executionContext: data.executionContext as any,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return workflow;
    },

    get: async (id: string): Promise<WorkflowRun> => {
      const workflow = await JazzWorkflowRun.load(id);
      return workflow;
    },
  },
};
