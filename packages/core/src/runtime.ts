import { waitUntil } from '@vercel/functions';
import type { Event, WorkflowRun } from '@vercel/workflow-world';
import { WorkflowAPIError } from '@vercel/workflow-world-vercel';
import {
  WorkflowRunFailedError,
  WorkflowRunNotCompletedError,
  WorkflowRuntimeError,
} from './errors.js';
import { FatalError, RetryableError, WorkflowSuspension } from './global.js';
import { runtimeLogger } from './logger.js';
import { getStepFunction } from './private.js';
import type { start } from './runtime/start.js';
import { getWorld, getWorldHandlers } from './runtime/world.js';
import {
  type Serializable,
  type StepInvokePayload,
  StepInvokePayloadSchema,
  type WorkflowInvokePayload,
  WorkflowInvokePayloadSchema,
} from './schemas.js';
import {
  dehydrateStepArguments,
  dehydrateStepReturnValue,
  hydrateStepArguments,
  hydrateWorkflowReturnValue,
} from './serialization.js';
// TODO: move step handler out to a separate file
import { contextStorage } from './step/context-storage.js';
import * as Attribute from './telemetry/semantic-conventions.js';
import { serializeTraceCarrier, trace, withTraceContext } from './telemetry.js';
import { getErrorName, getErrorStack, isInstanceOf } from './types.js';
import { buildWorkflowSuspensionMessage } from './util.js';
import { runWorkflow } from './workflow.js';

export type { Event, WorkflowRun };
export { WorkflowSuspension } from './global.js';
export {
  getWorkflowReadableStream,
  type WorkflowReadableStreamOptions,
} from './runtime/readable-stream.js';
export { type StartOptions, start } from './runtime/start.js';
export { handleWebhook, processWebhooks } from './runtime/webhook.js';

/**
 * Retrieves the workflow run metadata and status information for a given run ID.
 *
 * @param runId - The workflow run ID obtained from {@link start}.
 * @throws `Error` - When the workflow run is not found or `deploymentId` is missing.
 */
export async function getWorkflowRun(runId: string) {
  const world = getWorld();
  const deploymentId = await world.getDeploymentId();
  if (!deploymentId) {
    throw new Error('A `deploymentId` must be provided to get a workflow run');
  }
  return world.runs.get(runId);
}

/**
 * Retrieves the final return value of a completed workflow run.
 *
 * @param runId - The workflow run ID obtained from {@link start}.
 * @param ops - Internal parameter for cleanup operations.
 * @param global - Internal parameter for type hydration scope.
 * @throws `WorkflowRunNotCompletedError` - When the workflow is still running or pending.
 * @throws `WorkflowRunFailedError` - When the workflow has failed.
 */
export async function getWorkflowReturnValue(
  runId: string,
  ops: Promise<any>[] = [],
  global: Record<string, any> = globalThis
) {
  const run = await getWorkflowRun(runId);

  if (run.status === 'completed' || run.status === 'cancelled') {
    return hydrateWorkflowReturnValue(run.output as any, ops, global);
  }

  if (run.status === 'failed') {
    throw new WorkflowRunFailedError(runId, run.error ?? 'Unknown error');
  }

  throw new WorkflowRunNotCompletedError(runId, run.status);
}

/**
 * Loads all workflow run events by iterating through all pages of paginated results.
 * This ensures that *all* events are loaded into memory before running the workflow.
 */
async function getAllWorkflowRunEvents(runId: string): Promise<Event[]> {
  const allEvents: Event[] = [];
  let cursor: string | null = null;
  let hasMore = true;

  const world = getWorld();
  while (hasMore) {
    const response = await world.events.list({
      runId,
      pagination: cursor ? { cursor } : undefined,
    });

    allEvents.push(...response.data);
    hasMore = response.hasMore;
    cursor = response.cursor;
  }

  return allEvents;
}

/**
 * Function that creates a single route which handles any workflow execution
 * request and routes to the appropriate workflow function.
 *
 * @param workflowCode - The workflow bundle code containing all the workflow
 * functions at the top level.
 * @returns A function that can be used as a Vercel API route.
 */
export function vercelAPIWorkflowsEntrypoint(workflowCode: string) {
  return getWorldHandlers().createQueueHandler(
    '__wkf_workflow_',
    async (message_, metadata) => {
      const { runId, traceCarrier: traceContext } =
        WorkflowInvokePayloadSchema.parse(message_);
      // Extract the workflow name from the topic name
      const workflowName = metadata.queueName.slice('__wkf_workflow_'.length);

      // Invoke user workflow within the propagated trace context
      return await withTraceContext(traceContext, async () => {
        const world = getWorld();
        return trace(`WORKFLOW ${workflowName}`, async (span) => {
          span?.setAttributes({
            ...Attribute.WorkflowName(workflowName),
            ...Attribute.WorkflowOperation('execute'),
            ...Attribute.QueueName(metadata.queueName),
          });

          // TODO: validate `workflowName` exists before consuming message?

          span?.setAttributes({
            ...Attribute.WorkflowRunId(runId),
            ...Attribute.WorkflowTracePropagated(!!traceContext),
          });

          let workflowStartedAt = -1;
          try {
            let workflowRun = await getWorkflowRun(runId);

            if (workflowRun.status === 'pending') {
              workflowRun = await world.runs.update(runId, {
                // This sets the `startedAt` timestamp at the database level
                status: 'running',
              });
            }

            // At this point, the workflow is "running" and `startedAt` should
            // definitely be set.
            if (!workflowRun.startedAt) {
              throw new Error(
                `Workflow run "${runId}" has no "startedAt" timestamp`
              );
            }
            workflowStartedAt = +workflowRun.startedAt;

            span?.setAttributes({
              ...Attribute.WorkflowRunStatus(workflowRun.status),
              ...Attribute.WorkflowStartedAt(workflowStartedAt),
            });

            if (workflowRun.status !== 'running') {
              // Workflow has already completed or failed, so we can skip it
              console.warn(
                `Workflow "${runId}" has status "${workflowRun.status}", skipping`
              );
              return;
            }

            // Load all events into memory before running
            const events = await getAllWorkflowRunEvents(workflowRun.runId);

            const result = await runWorkflow(workflowCode, workflowRun, events);

            // Update the workflow run with the result
            await world.runs.update(runId, {
              status: 'completed',
              output: result as Serializable,
            });

            span?.setAttributes({
              ...Attribute.WorkflowRunStatus('completed'),
              ...Attribute.WorkflowEventsCount(events.length),
            });
          } catch (err) {
            if (isInstanceOf(err, WorkflowSuspension)) {
              const suspensionMessage = buildWorkflowSuspensionMessage(
                runId,
                err.stepCount,
                err.webhookCount
              );
              if (suspensionMessage) {
                // Note: suspensionMessage logged only in debug mode to avoid production noise
                // console.debug(suspensionMessage);
              }
              // Process each operation in the queue (steps and webhooks)
              for (const queueItem of err.steps) {
                if (queueItem.type === 'step') {
                  // Handle step operations
                  const ops: Promise<void>[] = [];
                  const dehydratedArgs = dehydrateStepArguments(
                    queueItem.args,
                    err.globalThis
                  );

                  try {
                    const step = await world.steps.create(runId, {
                      stepId: queueItem.correlationId,
                      stepName: queueItem.stepName,
                      input: dehydratedArgs as Serializable[],
                    });

                    waitUntil(Promise.all(ops));

                    await world.queue(
                      `__wkf_step_${queueItem.stepName}`,
                      {
                        workflowName,
                        workflowRunId: runId,
                        workflowStartedAt,
                        stepId: step.stepId,
                        traceCarrier: await serializeTraceCarrier(),
                      } satisfies StepInvokePayload,
                      {
                        idempotencyKey: queueItem.correlationId,
                      }
                    );
                  } catch (err) {
                    if (
                      isInstanceOf(err, WorkflowAPIError) &&
                      err.status === 409
                    ) {
                      // Step already exists, so we can skip it
                      console.warn(
                        `Step "${queueItem.stepName}" with correlation ID "${queueItem.correlationId}" already exists, skipping: ${err.message}`
                      );
                      continue;
                    }
                    throw err;
                  }
                } else if (queueItem.type === 'webhook') {
                  // Handle webhook operations
                  try {
                    // Create webhook in database
                    await world.webhooks.create(runId, {
                      webhookId: queueItem.correlationId,
                      url: queueItem.url,
                      allowedMethods: queueItem.allowedMethods,
                      headersSchema: queueItem.headersSchema,
                      searchParamsSchema: queueItem.searchParamsSchema,
                      bodySchema: queueItem.bodySchema,
                    });

                    // Create webhook_created event in event log
                    await world.events.create(runId, {
                      eventType: 'webhook_created',
                      correlationId: queueItem.correlationId,
                    });
                  } catch (err) {
                    if (isInstanceOf(err, WorkflowAPIError)) {
                      if (err.status === 409) {
                        // Webhook already exists (duplicate webhook_id constraint), so we can skip it
                        console.warn(
                          `Webhook with correlation ID "${queueItem.correlationId}" already exists, skipping: ${err.message}`
                        );
                        continue;
                      } else if (err.status === 410) {
                        // Workflow has already completed, so no-op
                        console.warn(
                          `Workflow run "${runId}" has already completed, skipping webhook "${queueItem.correlationId}": ${err.message}`
                        );
                        continue;
                      }
                    }
                    throw err;
                  }
                }
              }
              span?.setAttributes({
                ...Attribute.WorkflowRunStatus('pending_steps'),
                ...Attribute.WorkflowStepsCreated(err.steps.length),
              });
            } else {
              const errorName = getErrorName(err);
              const errorStack = getErrorStack(err);
              console.error(
                `${errorName} while running "${runId}" workflow:\n\n${errorStack}`
              );
              await world.runs.update(runId, {
                status: 'failed',
                error: String(err),
                // TODO: include error codes when we define them
                // TODO: serialize/include the error name and stack?
              });
              span?.setAttributes({
                ...Attribute.WorkflowRunStatus('failed'),
                ...Attribute.WorkflowErrorName(errorName),
                ...Attribute.WorkflowErrorMessage(String(err)),
              });
            }
          }
        }); // End withTraceContext
      });
    }
  );
}

/**
 * A single route that handles any step execution request and routes to the
 * appropriate step function. We may eventually want to create different bundles
 * for each step, this is temporary.
 */
export const vercelAPIStepsEntrypoint =
  /* @__PURE__ */ getWorldHandlers().createQueueHandler(
    '__wkf_step_',
    async (message_, metadata) => {
      const {
        workflowName,
        workflowRunId,
        workflowStartedAt,
        stepId,
        traceCarrier: traceContext,
      } = StepInvokePayloadSchema.parse(message_);
      // Execute step within the propagated trace context
      return await withTraceContext(traceContext, async () => {
        // Extract the step name from the topic name
        const stepName = metadata.queueName.slice('__wkf_step_'.length);
        const world = getWorld();

        return trace(`STEP ${stepName}`, async (span) => {
          span?.setAttributes({
            ...Attribute.StepName(stepName),
            ...Attribute.StepAttempt(metadata.attempt),
            ...Attribute.QueueName(metadata.queueName),
          });

          const stepFn = getStepFunction(stepName);
          if (!stepFn) {
            throw new Error(`Step "${stepName}" not found`);
          }
          if (typeof stepFn !== 'function') {
            throw new Error(
              `Step "${stepName}" is not a function (got ${typeof stepFn})`
            );
          }

          span?.setAttributes({
            ...Attribute.WorkflowName(workflowName),
            ...Attribute.WorkflowRunId(workflowRunId),
            ...Attribute.StepId(stepId),
            ...Attribute.StepMaxRetries(stepFn.maxRetries ?? 3),
            ...Attribute.StepTracePropagated(!!traceContext),
          });

          let step = await world.steps.get(workflowRunId, stepId);

          runtimeLogger.debug('Step execution details', {
            stepName,
            stepId: step.stepId,
            status: step.status,
            attempt: step.attempt,
          });

          span?.setAttributes({
            ...Attribute.StepStatus(step.status),
            ...Attribute.StepRetryCount(step.attempt),
          });

          let result: unknown;
          try {
            if (step.status === 'pending') {
              step = await world.steps.update(workflowRunId, stepId, {
                status: 'running',
              });
              await world.events.create(workflowRunId, {
                eventType: 'step_started',
                correlationId: stepId,
              });
            }

            if (step.status !== 'running') {
              console.error(
                `Step "${stepId}" has status "${step.status}", skipping${step.error ? `: ${step.error}` : ''}`
              );
              span?.setAttributes({
                ...Attribute.StepSkipped(true),
                ...Attribute.StepSkipReason(step.status),
              });
              return;
            }

            if (!step.startedAt) {
              throw new WorkflowRuntimeError(
                `Step "${stepId}" has no "startedAt" timestamp`
              );
            }

            // Hydrate the step input arguments
            const ops: Promise<void>[] = [];
            const args = hydrateStepArguments(step.input, ops);

            span?.setAttributes({
              ...Attribute.StepArgumentsCount(args.length),
            });

            result = await contextStorage.run(
              {
                stepContext: {
                  stepId,
                  stepStartedAt: new Date(+step.startedAt),
                  attempt: metadata.attempt,
                },
                workflowContext: {
                  workflowRunId,
                  workflowStartedAt: new Date(+workflowStartedAt),
                  url: `https://${process.env.VERCEL_URL}`,
                },
              },
              () => stepFn(...args)
            );

            result = dehydrateStepReturnValue(result, ops);

            waitUntil(Promise.all(ops));

            // Update the event log with the step result
            await world.events.create(workflowRunId, {
              eventType: 'step_completed',
              correlationId: stepId,
              eventData: {
                result: result as Serializable,
              },
            });

            await world.steps.update(workflowRunId, stepId, {
              status: 'completed',
              output: result as Serializable,
            });

            span?.setAttributes({
              ...Attribute.StepStatus('completed'),
              ...Attribute.StepResultType(typeof result),
            });
          } catch (err: unknown) {
            span?.setAttributes({
              ...Attribute.StepErrorName(getErrorName(err)),
              ...Attribute.StepErrorMessage(String(err)),
            });

            if (isInstanceOf(err, WorkflowAPIError)) {
              if (err.status === 410) {
                // Workflow has already completed, so no-op
                console.warn(
                  `Workflow run "${workflowRunId}" has already completed, skipping step "${stepId}": ${err.message}`
                );
                return;
              }
            }

            if (isInstanceOf(err, FatalError)) {
              const stackLines = getErrorStack(err).split('\n').slice(0, 4);
              console.error(
                `[Workflows] "${workflowRunId}" - Encountered \`FatalError\` while executing step "${stepName}":\n  > ${stackLines.join('\n    > ')}\n\nBubbling up error to parent workflow`
              );
              // Fatal error - store the error in the event log and re-invoke the workflow
              await world.events.create(workflowRunId, {
                eventType: 'step_failed',
                correlationId: stepId,
                eventData: {
                  error: String(err),
                  stack: err.stack,
                  fatal: true,
                },
              });
              await world.steps.update(workflowRunId, stepId, {
                status: 'failed',
                error: String(err),
                // TODO: include error codes when we define them
                // TODO: serialize/include the error name and stack?
              });

              span?.setAttributes({
                ...Attribute.StepStatus('failed'),
                ...Attribute.StepFatalError(true),
              });
            } else {
              const attempt = metadata.attempt;
              const maxRetries = stepFn.maxRetries ?? 3;

              span?.setAttributes({
                ...Attribute.StepAttempt(attempt),
                ...Attribute.StepMaxRetries(maxRetries),
              });

              if (attempt >= maxRetries) {
                // Max retries reached
                const stackLines = getErrorStack(err).split('\n').slice(0, 4);
                console.error(
                  `[Workflows] "${workflowRunId}" - Encountered \`Error\` while executing step "${stepName}" (attempt ${attempt}):\n  > ${stackLines.join('\n    > ')}\n\n  Max retries reached\n  Bubbling error to parent workflow`
                );
                const errorMessage = `Step "${stepName}" failed after max retries: ${String(err)}`;
                await world.events.create(workflowRunId, {
                  eventType: 'step_failed',
                  correlationId: stepId,
                  eventData: {
                    error: errorMessage,
                    stack: getErrorStack(err),
                    fatal: true,
                  },
                });
                await world.steps.update(workflowRunId, stepId, {
                  status: 'failed',
                  error: errorMessage,
                });

                span?.setAttributes({
                  ...Attribute.StepStatus('failed'),
                  ...Attribute.StepRetryExhausted(true),
                });
              } else {
                // Not at max retries yet - log as a retryable error
                if (isInstanceOf(err, RetryableError)) {
                  console.warn(
                    `[Workflows] "${workflowRunId}" - Encountered \`RetryableError\` while executing step "${stepName}" (attempt ${attempt}):\n  > ${String(err.message)}\n\n  This step has failed but will be retried`
                  );
                } else {
                  const stackLines = getErrorStack(err).split('\n').slice(0, 4);
                  console.error(
                    `[Workflows] "${workflowRunId}" - Encountered \`Error\` while executing step "${stepName}" (attempt ${attempt}):\n  > ${stackLines.join('\n    > ')}\n\n  This step has failed but will be retried`
                  );
                }
                await world.events.create(workflowRunId, {
                  eventType: 'step_failed',
                  correlationId: stepId,
                  eventData: {
                    error: String(err),
                    stack: getErrorStack(err),
                  },
                });
                const timeoutSeconds = Math.max(
                  1,
                  isInstanceOf(err, RetryableError)
                    ? Math.floor(
                        (+err.retryAfter.getTime() - Date.now()) / 1000
                      )
                    : 1
                );

                span?.setAttributes({
                  ...Attribute.StepRetryTimeoutSeconds(timeoutSeconds),
                  ...Attribute.StepRetryWillRetry(true),
                });

                // It's a retryable error - so have the queue keep the message visible
                // so that it gets retried.
                return { timeoutSeconds };
              }
            }
          }

          await world.queue(`__wkf_workflow_${workflowName}`, {
            runId: workflowRunId,
            traceCarrier: await serializeTraceCarrier(),
          } satisfies WorkflowInvokePayload);
        });
      });
    }
  );

// this is a no-op placeholder as the client is
// expecting this to be present but we aren't actually using it
export function runStep() {}
