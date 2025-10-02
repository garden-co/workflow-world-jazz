import {
  type CreateStepRequest,
  type ListWorkflowRunStepsParams,
  type PaginatedResponse,
  PaginatedResponseSchema,
  type Step,
  StepSchema,
  type UpdateStepRequest,
} from '@vercel/workflow-world';
import type { APIConfig } from './utils.js';
import { dateToStringReplacer, makeRequest } from './utils.js';

// Functions
export async function listWorkflowRunSteps(
  params: ListWorkflowRunStepsParams,
  config?: APIConfig
): Promise<PaginatedResponse<Step>> {
  const searchParams = new URLSearchParams();
  if (params.pagination?.cursor)
    searchParams.set('cursor', params.pagination.cursor);
  if (params.pagination?.limit)
    searchParams.set('limit', params.pagination.limit.toString());

  const queryString = searchParams.toString();
  const endpoint = `/runs/${params.runId}/steps${queryString ? `?${queryString}` : ''}`;

  return makeRequest({
    endpoint,
    options: { method: 'GET' },
    config,
    schema: PaginatedResponseSchema(StepSchema),
  });
}

export async function createStep(
  runId: string,
  data: CreateStepRequest,
  config?: APIConfig
): Promise<Step> {
  return makeRequest({
    endpoint: `/runs/${runId}/steps`,
    options: {
      method: 'POST',
      body: JSON.stringify(data, dateToStringReplacer),
    },
    config,
    schema: StepSchema,
  });
}

export async function updateStep(
  runId: string,
  stepId: string,
  data: UpdateStepRequest,
  config?: APIConfig
): Promise<Step> {
  return makeRequest({
    endpoint: `/runs/${runId}/steps/${stepId}`,
    options: {
      method: 'PUT',
      body: JSON.stringify(data, dateToStringReplacer),
    },
    config,
    schema: StepSchema,
  });
}

export async function getStep(
  runId: string | undefined,
  stepId: string,
  config?: APIConfig
): Promise<Step> {
  const endpoint = runId
    ? `/runs/${runId}/steps/${stepId}`
    : `/steps/${stepId}`;
  return makeRequest({
    endpoint,
    options: { method: 'GET' },
    config,
    schema: StepSchema,
  });
}
