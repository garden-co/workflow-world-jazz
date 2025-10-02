import type { WorkflowContext } from '../workflow/get-workflow-context.js';
import { contextStorage } from './context-storage.js';

export type { WorkflowContext };

/**
 * Returns metadata available in the current workflow run inside a step function.
 */
export function getWorkflowContext(): WorkflowContext {
  const ctx = contextStorage.getStore();
  if (!ctx) {
    throw new Error(
      '`getWorkflowContext()` can only be called inside a workflow or step function'
    );
  }
  return ctx.workflowContext;
}
