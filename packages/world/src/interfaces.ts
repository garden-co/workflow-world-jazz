import type { AuthInfo, HealthCheckResponse } from './auth.js';
import type { CreateEventRequest, Event, ListEventsParams } from './events.js';
import type { Queue } from './queue.js';
import type {
  CreateWorkflowRunRequest,
  ListWorkflowRunsParams,
  UpdateWorkflowRunRequest,
  WorkflowRun,
} from './runs.js';
import type { PaginatedResponse } from './shared.js';
import type {
  CreateStepRequest,
  ListWorkflowRunStepsParams,
  Step,
  UpdateStepRequest,
} from './steps.js';
import type {
  CreateWebhookRequest,
  ListWebhooksByUrlParams,
  Webhook,
} from './webhooks.js';

export interface Streamer {
  writeToStream(
    name: string,
    chunk: string | Uint8Array | Buffer
  ): Promise<void>;
  closeStream(name: string): Promise<void>;
  readFromStream(
    name: string,
    startIndex?: number
  ): Promise<ReadableStream<Uint8Array>>;
}

export interface AuthProvider {
  getAuthInfo(): Promise<AuthInfo>;
  checkHealth(): Promise<HealthCheckResponse>;
}

export interface Storage {
  runs: {
    create(data: CreateWorkflowRunRequest): Promise<WorkflowRun>;
    get(id: string): Promise<WorkflowRun>;
    update(id: string, data: UpdateWorkflowRunRequest): Promise<WorkflowRun>;
    list(
      params?: ListWorkflowRunsParams
    ): Promise<PaginatedResponse<WorkflowRun>>;
    cancel(id: string): Promise<WorkflowRun>;
    pause(id: string): Promise<WorkflowRun>;
    resume(id: string): Promise<WorkflowRun>;
  };

  steps: {
    create(runId: string, data: CreateStepRequest): Promise<Step>;
    get(runId: string | undefined, stepId: string): Promise<Step>;
    update(
      runId: string,
      stepId: string,
      data: UpdateStepRequest
    ): Promise<Step>;
    list(params: ListWorkflowRunStepsParams): Promise<PaginatedResponse<Step>>;
  };

  events: {
    create(runId: string, data: CreateEventRequest): Promise<Event>;
    list(params: ListEventsParams): Promise<PaginatedResponse<Event>>;
  };

  webhooks: {
    create(runId: string, data: CreateWebhookRequest): Promise<Webhook>;
    get(webhookId: string, deploymentId: string): Promise<Webhook>;
    dispose(webhookId: string, deploymentId: string): Promise<Webhook>;
    getByUrl(
      url: string,
      deploymentId: string,
      params?: ListWebhooksByUrlParams
    ): Promise<PaginatedResponse<Webhook>>;
  };
}

/**
 * The "World" interface represents how Workflows are able to communicate with the outside world.
 * This means persistence, queuing and serialization.
 */
export interface World extends Queue, Storage, AuthProvider, Streamer {}
