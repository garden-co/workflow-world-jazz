import {
  FatalError,
  fetch,
  getStepContext,
  getWebhook,
  getWorkflowContext,
  getWorkflowWritableStream,
  sleep,
} from '@vercel/workflow-core';

//////////////////////////////////////////////////////////

export async function add(a: number, b: number) {
  'use step';
  return a + b;
}

export async function addTenWorkflow(input: number) {
  'use workflow';
  const a = await add(input, 2);
  const b = await add(a, 3);
  const c = await add(b, 5);
  return c;
}

//////////////////////////////////////////////////////////

async function randomDelay(v: string) {
  'use step';
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 3000));
  return v.toUpperCase();
}

export async function promiseAllWorkflow() {
  'use workflow';
  const [a, b, c] = await Promise.all([
    randomDelay('a'),
    randomDelay('b'),
    randomDelay('c'),
  ]);
  return a + b + c;
}

//////////////////////////////////////////////////////////

async function specificDelay(delay: number, v: string) {
  'use step';
  await new Promise((resolve) => setTimeout(resolve, delay));
  return v.toUpperCase();
}

export async function promiseRaceWorkflow() {
  'use workflow';
  const winner = await Promise.race([
    specificDelay(2000, 'a'),
    specificDelay(100, 'b'), // "b" should always win
    specificDelay(3000, 'c'),
  ]);
  return winner;
}

//////////////////////////////////////////////////////////

async function stepThatFails() {
  'use step';
  throw new FatalError('step failed');
}

export async function promiseAnyWorkflow() {
  'use workflow';
  const winner = await Promise.any([
    stepThatFails(),
    specificDelay(1000, 'b'), // "b" should always win
    specificDelay(3000, 'c'),
  ]);
  return winner;
}

//////////////////////////////////////////////////////////

// Name should not conflict with genStream in 3_streams.ts
// TODO: swc transform should mangle names to avoid conflicts
async function genReadableStream() {
  'use step';
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      for (let i = 0; i < 10; i++) {
        controller.enqueue(encoder.encode(`${i}\n`));
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      controller.close();
    },
  });
}

export async function readableStreamWorkflow() {
  'use workflow';
  const stream = await genReadableStream();
  return stream;
}

//////////////////////////////////////////////////////////

export async function namedWebhookWorkflow() {
  'use workflow';
  const webhook = getWebhook({
    url: '/api/e2e/webhook',
    method: ['GET', 'POST', 'DELETE'],
  });

  const requests: {
    method: string;
    headers: Record<string, string>;
    body: any;
  }[] = [];
  for await (const request of webhook) {
    requests.push({
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: await request.text(),
    });

    if (request.method === 'DELETE') {
      // The DELETE request will be the last one, so break out of the loop
      break;
    }
  }
  return requests;
}

//////////////////////////////////////////////////////////

export async function sleepingWorkflow() {
  'use workflow';
  const startTime = Date.now();
  await sleep('10s');
  const endTime = Date.now();
  return { startTime, endTime };
}

export async function sleepingDateWorkflow(endDate: Date) {
  'use workflow';
  const startTime = Date.now();
  await sleep(endDate);
  const endTime = Date.now();
  return { startTime, endTime };
}

//////////////////////////////////////////////////////////

async function nullByteStep() {
  'use step';
  return 'null byte \0';
}

export async function nullByteWorkflow() {
  'use workflow';
  const a = await nullByteStep();
  return a;
}

//////////////////////////////////////////////////////////

async function stepWithContext() {
  'use step';
  const stepCtx = getStepContext();
  const workflowCtx = getWorkflowContext();
  return { stepCtx, workflowCtx };
}

export async function workflowAndStepContextWorkflow() {
  'use workflow';
  const workflowCtx = getWorkflowContext();
  const { stepCtx, workflowCtx: innerWorkflowCtx } = await stepWithContext();
  return {
    workflowCtx: {
      workflowRunId: workflowCtx.workflowRunId,
      workflowStartedAt: workflowCtx.workflowStartedAt,
      url: workflowCtx.url,
    },
    stepCtx,
    innerWorkflowCtx,
  };
}

//////////////////////////////////////////////////////////

async function stepWithOutputStreamBinary(writable: WritableStream) {
  'use step';
  const writer = writable.getWriter();
  // binary data
  await writer.write(new TextEncoder().encode('Hello, world!'));
  writer.releaseLock();
}

async function stepWithOutputStreamObject(writable: WritableStream) {
  'use step';
  const writer = writable.getWriter();
  // object data
  await writer.write({ foo: 'test' });
  writer.releaseLock();
}

async function stepCloseOutputStream(writable: WritableStream) {
  'use step';
  await writable.close();
}

export async function outputStreamWorkflow() {
  'use workflow';
  const writable = getWorkflowWritableStream();
  await sleep('1s');
  await stepWithOutputStreamBinary(writable);
  await sleep('1s');
  await stepWithOutputStreamObject(writable);
  await sleep('1s');
  await stepCloseOutputStream(writable);
  return 'done';
}

//////////////////////////////////////////////////////////

export async function fetchWorkflow() {
  'use workflow';
  const response = await fetch('https://jsonplaceholder.typicode.com/todos/1');
  const data = await response.json();
  return data;
}
