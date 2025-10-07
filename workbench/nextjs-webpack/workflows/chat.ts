import {
  convertToModelMessages,
  type FinishReason,
  type ModelMessage,
  stepCountIs,
  streamText,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import { FLIGHT_ASSISTANT_PROMPT, flightBookingTools } from './chat-tools';

const MAX_STEPS = 10;

/** A Stream Text Step */
export async function streamTextStep(
  step: number,
  messages: ModelMessage[],
  writablele: WritableStream<UIMessageChunk>
) {
  'use step';

  // Send start data message
  const writer = writablele.getWriter();
  writer.write({
    type: 'data-workflow',
    data: {
      message: `Workflow step "streamTextStep" started (#${step})`,
    },
  });

  // Mimic a random network error
  if (Math.random() < 0.3) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    writer.write({
      type: 'data-workflow',
      data: {
        message: `Workflow step "streamTextStep" errored (#${step})`,
        type: 'error',
      },
    });
    throw new Error('Error connecting to LLM');
  }

  // Make the LLM request
  console.log('Sending request to LLM');
  const result = streamText({
    model: 'bedrock/claude-4-sonnet-20250514-v1',
    messages,
    system: FLIGHT_ASSISTANT_PROMPT,
    // We'll handle the back and forth ourselves
    stopWhen: stepCountIs(1),
    tools: flightBookingTools,
    headers: {
      'anthropic-beta': 'interleaved-thinking-2025-05-14',
    },
    providerOptions: {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 16000 },
      },
    },
  });

  // Pipe the stream to the client
  const reader = result
    // We send these chunks outside the loop
    .toUIMessageStream({ sendStart: false, sendFinish: false })
    .getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writer.write(value);
    }
  } finally {
    writer.write({
      type: 'data-workflow',
      data: {
        message: `Workflow step "streamTextStep" completed (#${step})`,
      },
    });
    reader.releaseLock();
    writer.releaseLock();
  }

  // Return the values back to the workflow
  const finishReason = await result.finishReason;

  // Workflow will retry errors
  if (finishReason === 'error') {
    writer.write({
      type: 'data-workflow',
      data: {
        message: `Workflow step "streamTextStep" errored (#${step})`,
        type: 'error',
      },
    });
    throw new Error('LLM error from streamTextStep');
  }

  return {
    messages: (await result.response).messages,
    finishReason,
  };
}

export async function endStream(writablele: WritableStream<UIMessageChunk>) {
  'use step';
  const writer = writablele.getWriter();

  console.log('Closing workflow stream');

  writer.write({
    type: 'data-workflow',
    data: {
      message: 'Closing workflow stream',
    },
  });

  writer.write({
    type: 'finish',
  });

  writer.close();
  writer.releaseLock(); // likely not needed
}

/**
 * The main chat workflow
 */
export async function chat(
  messages: UIMessage[],
  writable: WritableStream<UIMessageChunk>
) {
  'use workflow';

  const currMessages: ModelMessage[] = convertToModelMessages(messages);
  let finishReason: FinishReason = 'unknown';

  console.log('Starting workflow');

  // Run streamText in a loop while we have tool calls
  for (let i = 0; i < MAX_STEPS; i++) {
    console.log(`Running step ${i + 1}`);

    const result = await streamTextStep(i, currMessages, writable);

    currMessages.push(...result.messages);
    finishReason = result.finishReason;

    if (finishReason !== 'tool-calls') {
      break;
    }
  }

  // Send an end message to the client
  await endStream(writable);

  console.log('Finished workflow');

  return currMessages.slice(-1)[0];
}
