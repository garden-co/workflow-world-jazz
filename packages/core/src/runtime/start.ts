import { waitUntil } from '@vercel/functions';
import type { WorkflowRun } from '@vercel/workflow-world';
import type { Serializable, WorkflowInvokePayload } from '../schemas.js';
import { dehydrateWorkflowArguments } from '../serialization.js';
import * as Attribute from '../telemetry/semantic-conventions.js';
import { serializeTraceCarrier, trace } from '../telemetry.js';
import { getWorld } from './world.js';

export interface StartOptions {
  /**
   * The deployment ID to use for the workflow run.
   */
  deploymentId?: string;
}

/**
 * Represents an imported workflow function.
 */
export type WorkflowFunction<TArgs extends unknown[], TResult> = (
  ...args: TArgs
) => Promise<TResult>;

/**
 * Represents the generated metadata of a workflow function.
 */
export type WorkflowMetadata = { workflowId: string };

/**
 * Starts a workflow run.
 *
 * @param workflow - The imported workflow function to start.
 * @param args - The arguments to pass to the workflow (optional).
 * @param options - The options for the workflow run (optional).
 * @returns The unique run ID for the newly started workflow invocation.
 */
export function start<TArgs extends unknown[], TResult>(
  workflow: WorkflowFunction<TArgs, TResult> | WorkflowMetadata,
  args: TArgs,
  options?: StartOptions
): Promise<WorkflowRun>;

export function start<TArgs extends unknown[], TResult>(
  workflow: WorkflowFunction<TArgs, TResult> | WorkflowMetadata,
  options?: StartOptions
): Promise<WorkflowRun>;

export async function start<TArgs extends unknown[], TResult>(
  workflow: WorkflowFunction<TArgs, TResult> | WorkflowMetadata,
  argsOrOptions?: TArgs | StartOptions,
  options?: StartOptions
) {
  // @ts-expect-error this field is added by our client transform
  const workflowName = workflow.workflowId;

  if (!workflowName) {
    throw new Error(
      `"start" was not called with valid workflow function being passed, ensure the workflow transform was applied and imported workflow function is first argument!`
    );
  }

  return trace(`WORKFLOW.start ${workflowName}`, async (span) => {
    span?.setAttributes({
      ...Attribute.WorkflowName(workflowName),
      ...Attribute.WorkflowOperation('start'),
    });

    let args: Serializable[] = [];
    let opts: StartOptions = options ?? {};
    if (Array.isArray(argsOrOptions)) {
      args = argsOrOptions as Serializable[];
    } else if (typeof argsOrOptions === 'object') {
      opts = argsOrOptions;
    }

    span?.setAttributes({
      ...Attribute.WorkflowArgumentsCount(args.length),
    });

    const world = getWorld();
    const deploymentId = opts.deploymentId ?? (await world.getDeploymentId());
    const ops: Promise<void>[] = [];
    const workflowArguments = dehydrateWorkflowArguments(args, ops);
    // Serialize current trace context to propagate across queue boundary
    const traceCarrier = await serializeTraceCarrier();

    const run = await world.runs.create({
      deploymentId: deploymentId,
      workflowName: workflowName,
      input: workflowArguments,
      executionContext: { traceCarrier },
    });
    waitUntil(Promise.all(ops));

    span?.setAttributes({
      ...Attribute.WorkflowRunId(run.runId),
      ...Attribute.WorkflowRunStatus(run.status),
      ...Attribute.DeploymentId(deploymentId),
    });

    await world.queue(
      `__wkf_workflow_${workflowName}`,
      {
        runId: run.runId,
        traceCarrier,
      } satisfies WorkflowInvokePayload,
      {
        deploymentId,
      }
    );

    return run;
  });
}
