import { getExternalRevivers } from '../serialization.js';
import type { getWorkflowWritableStream } from '../writable-stream.js';

/**
 * The options for {@link getWorkflowReadableStream}.
 */
export interface WorkflowReadableStreamOptions {
  /**
   * The index number of the starting chunk to beging reading the stream from.
   */
  startIndex?: number;
  /**
   * Any asynchronous operations that need to be performed before the execution
   * environment is paused / terminated
   * (i.e. using [`waitUntil()`](https://developer.mozilla.org/docs/Web/API/ExtendableEvent/waitUntil) or similar).
   */
  ops?: Promise<any>[];
  /**
   * The global object to use for hydrating types from the global scope.
   *
   * Defaults to {@link [`globalThis`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/globalThis)}.
   */
  global?: Record<string, any>;
}

/**
 * Retrieves the workflow run's default readable stream, which reads chunks
 * written to the corresponding writable stream {@link getWorkflowWritableStream}.
 *
 * @param runId - The workflow run ID.
 * @param options - The options for the readable stream.
 * @returns The `ReadableStream` for the workflow run.
 */
export function getWorkflowReadableStream<R = any>(
  runId: string,
  options: WorkflowReadableStreamOptions = {}
): ReadableStream<R> {
  const { ops = [], global = globalThis, startIndex } = options;
  return getExternalRevivers(global, ops).ReadableStream({
    name: runId,
    startIndex,
  }) as ReadableStream<R>;
}
