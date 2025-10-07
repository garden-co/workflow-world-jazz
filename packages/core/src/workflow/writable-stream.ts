import { STREAM_NAME_SYMBOL } from '../symbols.js';
import { getWorkflowContext } from './get-workflow-context.js';

export function getWorkflowWritableStream<W = any>(): WritableStream<W> {
  const ctx = getWorkflowContext();
  return Object.create(globalThis.WritableStream.prototype, {
    [STREAM_NAME_SYMBOL]: {
      value: ctx.workflowRunId,
      writable: false,
    },
  });
}
