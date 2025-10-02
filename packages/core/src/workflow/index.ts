import type { StepContext } from '../step/get-step-context.js';

export { __builtin_fetch as fetch } from '../builtins.js';
export type {
  Webhook,
  WebhookOptions,
} from '../get-webhook.js';
export {
  FatalError,
  RetryableError,
  type RetryableErrorOptions,
} from '../global.js';
export { sleep } from '../sleep.js';
export { getWebhook } from './get-webhook.js';
export { getWorkflowContext } from './get-workflow-context.js';
export { getWorkflowWritableStream } from './writable-stream.js';

// workflows can't use `getStepContext` but we still need to provide
// the export so bundling doesn't fail when step and workflow are in same file
export function getStepContext(): StepContext {
  throw new Error(
    '`getStepContext()` can only be called inside a step function'
  );
}
