import type { AuthProvider, Storage } from '@vercel/workflow-world';
import { checkHealth, getAuthInfo } from './auth.js';
import { createWorkflowRunEvent, getWorkflowRunEvents } from './events.js';
import {
  cancelWorkflowRun,
  createWorkflowRun,
  getWorkflowRun,
  listWorkflowRuns,
  pauseWorkflowRun,
  resumeWorkflowRun,
  updateWorkflowRun,
} from './runs.js';
import {
  createStep,
  getStep,
  listWorkflowRunSteps,
  updateStep,
} from './steps.js';
import type { APIConfig } from './utils.js';
import {
  createWebhook,
  disposeWebhook,
  getWebhook,
  getWebhooksByUrl,
} from './webhooks.js';

export function createStorage(config?: APIConfig): Storage & AuthProvider {
  return {
    // AuthProvider interface
    getAuthInfo: () => getAuthInfo(config),
    checkHealth: () => checkHealth(config),

    // Storage interface with namespaced methods
    runs: {
      create: (data) => createWorkflowRun(data, config),
      get: (id) => getWorkflowRun(id, config),
      update: (id, data) => updateWorkflowRun(id, data, config),
      list: (params) => listWorkflowRuns(params, config),
      cancel: (id) => cancelWorkflowRun(id, config),
      pause: (id) => pauseWorkflowRun(id, config),
      resume: (id) => resumeWorkflowRun(id, config),
    },
    steps: {
      create: (runId, data) => createStep(runId, data, config),
      get: (runId, stepId) => getStep(runId, stepId, config),
      update: (runId, stepId, data) => updateStep(runId, stepId, data, config),
      list: (params) => listWorkflowRunSteps(params, config),
    },
    events: {
      create: (runId, data) => createWorkflowRunEvent(runId, data, config),
      list: (params) => getWorkflowRunEvents(params, config),
    },
    webhooks: {
      create: (runId, data) => createWebhook(runId, data, config),
      get: (webhookId, deploymentId) =>
        getWebhook(webhookId, deploymentId, config),
      dispose: (webhookId, deploymentId) =>
        disposeWebhook(webhookId, deploymentId, config),
      getByUrl: (url, deploymentId, params) =>
        getWebhooksByUrl(url, deploymentId, params, config),
    },
  };
}
