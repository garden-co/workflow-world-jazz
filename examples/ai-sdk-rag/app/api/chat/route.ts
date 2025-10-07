import {
  getWorkflowReadableStream,
  start,
} from '@vercel/workflow-core/runtime';
import {
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import { chat } from '@/workflows/chat';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const workflowHandle = await start(chat, [messages]);
  const runId = workflowHandle.runId;

  return createUIMessageStreamResponse({
    stream: getWorkflowReadableStream<UIMessageChunk>(runId),
    headers: {
      'x-workflow-run-id': runId,
    },
  });
}
