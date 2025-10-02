import type { getWorkflowReadableStream } from './runtime/readable-stream.js';

/**
 * Retrieves the current workflow run's default writable stream.
 *
 * The writable stream is intended to be passed as an argument to steps which can
 * write to it. Chunks written to this stream can be read outside the workflow
 * by using {@link getWorkflowReadableStream}.
 *
 * @note This function can only be called inside a workflow function.
 * @returns The writable stream.
 */
export function getWorkflowWritableStream<W = any>(): WritableStream<W> {
  throw new Error(
    '`getWorkflowWritableStream()` can only be called inside a workflow function'
  );
}
