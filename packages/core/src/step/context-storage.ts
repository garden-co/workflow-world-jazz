import { AsyncLocalStorage } from 'node:async_hooks';
import type { WorkflowContext } from '../workflow/get-workflow-context.js';
import type { StepContext } from './get-step-context.js';

export const contextStorage = /* @__PURE__ */ new AsyncLocalStorage<{
  stepContext: StepContext;
  workflowContext: WorkflowContext;
}>();
