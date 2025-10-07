export interface WorkflowContext {
  /**
   * Unique identifier for the workflow run.
   */
  workflowRunId: string;

  /**
   * Timestamp when the workflow run started.
   */
  workflowStartedAt: Date;

  /**
   * The URL where the workflow can be triggered.
   */
  url: string;
}

export const WORKFLOW_CONTEXT_SYMBOL =
  /* @__PURE__ */ Symbol.for('WORKFLOW_CONTEXT');

export function getWorkflowContext(): WorkflowContext {
  // Inside the workflow VM, the context is stored in the globalThis object behind a symbol
  const ctx = (globalThis as any)[WORKFLOW_CONTEXT_SYMBOL] as WorkflowContext;
  if (!ctx) {
    throw new Error(
      '`getWorkflowContext()` can only be called inside a workflow or step function'
    );
  }
  return ctx;
}
