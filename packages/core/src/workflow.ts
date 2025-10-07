import { runInContext } from 'node:vm';
import { createContext } from '@vercel/workflow-vm';
import type { Event, WorkflowRun } from '@vercel/workflow-world';
import { monotonicFactory } from 'ulid';
import { EventConsumerResult, EventsConsumer } from './events-consumer.js';
import { ENOTSUP } from './global.js';
import type { WorkflowOrchestratorContext } from './private.js';
import {
  dehydrateWorkflowReturnValue,
  hydrateWorkflowArguments,
} from './serialization.js';
import { createUseStep } from './step.js';
import * as Attribute from './telemetry/semantic-conventions.js';
import { trace } from './telemetry.js';
import { withResolvers } from './util.js';
import type { WorkflowContext } from './workflow/get-workflow-context.js';
import { WORKFLOW_CONTEXT_SYMBOL } from './workflow/get-workflow-context.js';
import { createGetWebhook } from './workflow/webhook.js';

export async function runWorkflow(
  workflowCode: string,
  workflowRun: WorkflowRun,
  events: Event[]
): Promise<unknown> {
  return trace(`WORKFLOW.run ${workflowRun.workflowName}`, async (span) => {
    span?.setAttributes({
      ...Attribute.WorkflowName(workflowRun.workflowName),
      ...Attribute.WorkflowRunId(workflowRun.runId),
      ...Attribute.WorkflowRunStatus(workflowRun.status),
      ...Attribute.WorkflowEventsCount(events.length),
    });

    const startedAt = workflowRun.startedAt;
    if (!startedAt) {
      throw new Error(
        `Workflow run "${workflowRun.runId}" has no "startedAt" timestamp (should not happen)`
      );
    }

    const {
      context,
      globalThis: vmGlobalThis,
      updateTimestamp,
    } = createContext({
      seed: workflowRun.runId,
      fixedTimestamp: +startedAt,
    });

    const workflowDiscontinuation = withResolvers<void>();

    const url = `https://${process.env.VERCEL_URL}`;
    const ulid = monotonicFactory(() => vmGlobalThis.Math.random());

    const workflowContext: WorkflowOrchestratorContext = {
      url,
      workflowName: workflowRun.workflowName,
      workflowRunId: workflowRun.runId,
      globalThis: vmGlobalThis,
      onWorkflowError: workflowDiscontinuation.reject,
      eventsConsumer: new EventsConsumer(events),
      generateUlid: () => ulid(+startedAt),
      invocationsQueue: [],
    };

    // Subscribe to the events log to update the timestamp in the vm context
    workflowContext.eventsConsumer.subscribe((event) => {
      const createdAt = event?.createdAt;
      if (createdAt) {
        updateTimestamp(+createdAt);
      }
      // Never consume events - this is only a passive subscriber
      return EventConsumerResult.NotConsumed;
    });

    const useStep = createUseStep(workflowContext);
    const getWebhook = createGetWebhook(workflowContext);

    // @ts-expect-error - `@types/node` says symbol is not valid, but it does work
    vmGlobalThis[Symbol.for('WORKFLOW_USE_STEP')] = useStep;
    // @ts-expect-error - `@types/node` says symbol is not valid, but it does work
    vmGlobalThis[Symbol.for('WORKFLOW_GET_WEBHOOK')] = getWebhook;

    // For the workflow VM, we store the context in a symbol on the `globalThis` object
    const ctx: WorkflowContext = {
      workflowRunId: workflowRun.runId,
      workflowStartedAt: new vmGlobalThis.Date(+startedAt),
      url,
    };
    // @ts-expect-error - `@types/node` says symbol is not valid, but it does work
    vmGlobalThis[WORKFLOW_CONTEXT_SYMBOL] = ctx;

    // @ts-ignore Provide a hoisted fetch function
    vmGlobalThis.fetch = useStep<any[], Response>('__builtin_fetch');

    // `Request` and `Response` are special built-in classes that invoke steps
    // for the `json()`, `text()` and `arrayBuffer()` instance methods
    class Request implements globalThis.Request {
      constructor(_url: string, _options: RequestInit) {
        ENOTSUP();
      }
      cache!: globalThis.Request['cache'];
      credentials!: globalThis.Request['credentials'];
      destination!: globalThis.Request['destination'];
      headers!: Headers;
      integrity!: string;
      method!: string;
      mode!: globalThis.Request['mode'];
      redirect!: globalThis.Request['redirect'];
      referrer!: string;
      referrerPolicy!: globalThis.Request['referrerPolicy'];
      url!: string;
      keepalive!: boolean;
      signal!: AbortSignal;
      duplex!: 'half';
      clone(): Request {
        ENOTSUP();
      }
      body!: ReadableStream<any> | null;

      get bodyUsed() {
        return false;
      }

      // TODO: implement these
      blob!: () => Promise<Blob>;
      formData!: () => Promise<FormData>;

      async arrayBuffer() {
        return resArrayBuffer(this);
      }

      async json() {
        return resJson(this);
      }

      async text() {
        return resText(this);
      }
    }
    vmGlobalThis.Request = Request;

    const resJson = useStep<[any], any>('__builtin_response_json');
    const resText = useStep<[any], string>('__builtin_response_text');
    const resArrayBuffer = useStep<[any], ArrayBuffer>(
      '__builtin_response_array_buffer'
    );
    class Response implements globalThis.Response {
      type!: globalThis.Response['type'];
      url!: string;
      status!: number;
      statusText!: string;
      body!: ReadableStream<Uint8Array>;
      headers!: Headers;
      redirected!: boolean;

      // TODO: implement these
      clone!: () => Response;
      blob!: () => Promise<globalThis.Blob>;
      formData!: () => Promise<globalThis.FormData>;

      get ok() {
        return this.status >= 200 && this.status < 300;
      }

      get bodyUsed() {
        return false;
      }

      async arrayBuffer() {
        return resArrayBuffer(this);
      }

      async json() {
        return resJson(this);
      }

      static json(): Response {
        ENOTSUP();
      }

      async text() {
        return resText(this);
      }

      static error(): Response {
        ENOTSUP();
      }

      static redirect(_url: string, _status: number = 302): Response {
        ENOTSUP();
      }
    }
    vmGlobalThis.Response = Response;

    class ReadableStream<T> implements globalThis.ReadableStream<T> {
      constructor() {
        ENOTSUP();
      }

      get locked() {
        return false;
      }

      cancel(): any {
        ENOTSUP();
      }

      getReader(): any {
        ENOTSUP();
      }

      pipeThrough(): any {
        ENOTSUP();
      }

      pipeTo(): any {
        ENOTSUP();
      }

      tee(): any {
        ENOTSUP();
      }

      values(): any {
        ENOTSUP();
      }

      static from(): any {
        ENOTSUP();
      }

      [Symbol.asyncIterator](): any {
        ENOTSUP();
      }
    }
    vmGlobalThis.ReadableStream = ReadableStream;

    class WritableStream<T> implements globalThis.WritableStream<T> {
      constructor() {
        ENOTSUP();
      }

      get locked() {
        return false;
      }

      abort(): any {
        ENOTSUP();
      }

      close(): any {
        ENOTSUP();
      }

      getWriter(): any {
        ENOTSUP();
      }
    }
    vmGlobalThis.WritableStream = WritableStream;

    class TransformStream<I, O> implements globalThis.TransformStream<I, O> {
      readable: globalThis.ReadableStream<O>;
      writable: globalThis.WritableStream<I>;

      constructor() {
        ENOTSUP();
      }
    }
    vmGlobalThis.TransformStream = TransformStream;

    // Eventually we'll probably want to provide our own `console` object,
    // but for now we'll just expose the global one.
    vmGlobalThis.console = globalThis.console;

    // HACK: propagate symbol needed for AI gateway usage
    const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');
    // @ts-expect-error - `@types/node` says symbol is not valid, but it does work
    vmGlobalThis[SYMBOL_FOR_REQ_CONTEXT] = (globalThis as any)[
      SYMBOL_FOR_REQ_CONTEXT
    ];

    // Get a reference to the user-defined workflow function
    const workflowFn = runInContext(
      `${workflowCode}; globalThis.__private_workflows?.get(${JSON.stringify(workflowRun.workflowName)})`,
      context
    );

    if (typeof workflowFn !== 'function') {
      throw new ReferenceError(
        `Workflow ${JSON.stringify(
          workflowRun.workflowName
        )} must be a function, but got "${typeof workflowFn}" instead`
      );
    }

    const args = hydrateWorkflowArguments(workflowRun.input, vmGlobalThis);

    span?.setAttributes({
      ...Attribute.WorkflowArgumentsCount(args.length),
    });

    // Invoke user workflow
    const result = await Promise.race([
      workflowFn(...args),
      workflowDiscontinuation.promise,
    ]);

    const dehydrated = dehydrateWorkflowReturnValue(result, vmGlobalThis);

    span?.setAttributes({
      ...Attribute.WorkflowResultType(typeof result),
    });

    return dehydrated;
  });
}
