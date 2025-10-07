import { start } from '@vercel/workflow-core/runtime';
import { webhookConsumer } from '@/workflows/webhook-consumer';

export async function POST() {
  const { readable, writable } = new TransformStream<Uint8Array>();
  await start(webhookConsumer, [writable]);
  return new Response(readable);
}
