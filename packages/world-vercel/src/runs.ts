import {
  type CreateWorkflowRunRequest,
  type ListWorkflowRunsParams,
  type PaginatedResponse,
  PaginatedResponseSchema,
  type UpdateWorkflowRunRequest,
  type WorkflowRun,
  WorkflowRunSchema,
} from '@vercel/workflow-world';
import type { APIConfig } from './utils.js';
import { dateToStringReplacer, makeRequest } from './utils.js';

// Functions

/**
 * This query technically works but should be used sparingly till the backend
 * uses CH to resolve this instead of scanning a dynamo table.
 */
export async function listWorkflowRuns(
  params: ListWorkflowRunsParams = {},
  config?: APIConfig
): Promise<PaginatedResponse<WorkflowRun>> {
  const { workflowName, status, pagination } = params;

  const searchParams = new URLSearchParams();

  if (workflowName) searchParams.set('workflow_name', workflowName);
  if (status) searchParams.set('status', status);
  if (pagination?.limit) searchParams.set('limit', pagination.limit.toString());
  if (pagination?.cursor) searchParams.set('cursor', pagination.cursor);

  const queryString = searchParams.toString();
  const endpoint = `/runs${queryString ? `?${queryString}` : ''}`;

  return makeRequest({
    endpoint,
    options: { method: 'GET' },
    config,
    schema: PaginatedResponseSchema(WorkflowRunSchema),
  });
}

export async function createWorkflowRun(
  data: CreateWorkflowRunRequest,
  config?: APIConfig
): Promise<WorkflowRun> {
  return makeRequest({
    endpoint: '/runs/create',
    options: {
      method: 'POST',
      body: JSON.stringify(data, dateToStringReplacer),
    },
    config,
    schema: WorkflowRunSchema,
  });
}

export async function getWorkflowRun(
  id: string,
  config?: APIConfig
): Promise<WorkflowRun> {
  return makeRequest({
    endpoint: `/runs/${id}`,
    options: { method: 'GET' },
    config,
    schema: WorkflowRunSchema,
  });
}

export async function updateWorkflowRun(
  id: string,
  data: UpdateWorkflowRunRequest,
  config?: APIConfig
): Promise<WorkflowRun> {
  return makeRequest({
    endpoint: `/runs/${id}`,
    options: {
      method: 'PUT',
      body: JSON.stringify(data, dateToStringReplacer),
    },
    config,
    schema: WorkflowRunSchema,
  });
}

export async function cancelWorkflowRun(
  id: string,
  config?: APIConfig
): Promise<WorkflowRun> {
  return makeRequest({
    endpoint: `/runs/${id}/cancel`,
    options: { method: 'PUT' },
    config,
    schema: WorkflowRunSchema,
  });
}

export async function pauseWorkflowRun(
  id: string,
  config?: APIConfig
): Promise<WorkflowRun> {
  return makeRequest({
    endpoint: `/runs/${id}/pause`,
    options: { method: 'PUT' },
    config,
    schema: WorkflowRunSchema,
  });
}

export async function resumeWorkflowRun(
  id: string,
  config?: APIConfig
): Promise<WorkflowRun> {
  return makeRequest({
    endpoint: `/runs/${id}/resume`,
    options: { method: 'PUT' },
    config,
    schema: WorkflowRunSchema,
  });
}
