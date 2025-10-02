import {
  getStepContext,
  getWebhook,
  getWorkflowContext,
} from '@vercel/workflow-core';
import OpenAI from 'openai';
import { z } from 'zod';

/**
 * `getStepContext()` is a hook that allows you to access the step's context
 * of the current workflow run.
 *
 * It is useful for accessing the context of the current workflow run, such as
 * the workflow run ID, the workflow started at, and the attempt number.
 */
async function stepWithGetContext() {
  'use step';
  const ctx = getStepContext();
  console.log('step context', ctx);

  // Mimic a retryable error 50% of the time (so that the `attempt` counter increases)
  if (Math.random() < 0.5) {
    throw new Error('Retryable error');
  }
}

export async function withWorkflowContext() {
  'use workflow';
  const ctx = getWorkflowContext();
  console.log('workflow context', ctx);

  await stepWithGetContext();
}

async function initiateOpenAIResponse() {
  'use step';
  const openai = new OpenAI();
  const resp = await openai.responses.create({
    model: 'o3',
    input: 'Write a very long novel about otters in space.',
    background: true,
  });
  console.log('OpenAI response:', resp);
  return resp.id;
}

async function getOpenAIResponse(respId: string): Promise<string> {
  'use step';
  const openai = new OpenAI();
  const resp = await openai.responses.retrieve(respId);
  return resp.output_text;
}

/**
 * `getWebhook()` is a hook that allows you to register a webhook URL
 * that can be passed to external services as a callback URL, or used
 * for human-in-the-loop workflows by, for example, including in an email.
 *
 * The workflow run will be suspended until the webhook is called.
 */
export async function withGetWebhook() {
  'use workflow';

  // Initiate a background "Response" request to OpenAI,
  // which will invoke the webhook when it's done.
  const respId = await initiateOpenAIResponse();

  // Register the webhook URL and provide the schema for the
  // type of events that we are interested in, and specifically
  // for the exact response ID that we just created.
  const webhook = getWebhook({
    url: '/api/openai/webhook',
    body: z.object({
      type: z.string().startsWith('response.'),
      data: z.object({
        id: z.literal(respId),
      }),
    }),
  });
  console.log('Registered webhook:', webhook.url);

  // Wait for the webhook to be called.
  const req = await webhook;
  console.log('Received webhook request:', req);

  const body = await req.json();
  console.log('Webhook request body:', body);

  if (body.type === 'response.completed') {
    const text = await getOpenAIResponse(body.data.id);
    console.log('OpenAI response text:', text);
  }

  console.log('Webhook demo workflow completed');
}
