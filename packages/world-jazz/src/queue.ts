import {
  MessageId,
  type Queue,
  type QueuePrefix,
  type ValidQueueName,
} from '@vercel/workflow-world';
import { JazzWebhook } from 'jazz-webhook/webhook.js';
import { z } from 'zod';
import {
  JazzQueue,
  JazzQueueMessage,
  JazzQueueMessages,
  type JazzStorageAccountResolver,
} from './types.js';

const JazzWebhookPayload = z.object({
  coValueId: z.string(),
  updates: z.number(),
});

export const createQueue = (
  ensureLoaded: JazzStorageAccountResolver,
  port: number
): Queue => {
  if (!process.env.JAZZ_WEBHOOK_REGISTRY_ID) {
    throw new Error('JAZZ_WEBHOOK_REGISTRY_ID environment variable is not set');
  }
  const processedMessages = new Set<string>();

  return {
    async getDeploymentId(): Promise<string> {
      return 'dpl_jazz';
    },

    async queue(
      queueName: ValidQueueName,
      message: unknown,
      opts?: {
        deploymentId?: string;
        idempotencyKey?: string;
      }
    ): Promise<{ messageId: MessageId }> {
      const queues = (
        await ensureLoaded({
          root: {
            queues: true,
          },
        })
      ).root.queues;

      // biome-ignore lint/style/noNonNullAssertion: verified above
      const registry = await JazzWebhook.load(
        process.env.JAZZ_WEBHOOK_REGISTRY_ID!
      );

      let pathname: string;
      if (queueName.startsWith('__wkf_step_')) {
        pathname = `step`;
      } else if (queueName.startsWith('__wkf_workflow_')) {
        pathname = `flow`;
      } else {
        throw new Error('Unknown queue name prefix');
      }

      // biome-ignore lint/style/noNonNullAssertion: ensureLoaded throws if the stream is not found
      const queue = (
        await queues.$jazz
          .ensureLoaded({
            resolve: {
              [queueName]: true,
            },
          })
          .catch(() => {
            const queue = JazzQueue.create({ name: queueName, messages: {} });
            queues.$jazz.set(queueName, queue);

            registry.register(
              `http://localhost:${port}/.well-known/workflow/v1/${pathname}`,
              queue.messages.$jazz.id
            );

            return { [queueName]: queue };
          })
      )[queueName]!;

      const messages = (
        await queue.$jazz.ensureLoaded({
          resolve: {
            messages: true,
          },
        })
      ).messages;

      const msg = JazzQueueMessage.create({
        message: message as z.core.util.JSONType,
        deploymentId: opts?.deploymentId,
        idempotencyKey: opts?.idempotencyKey,
        queueName: queueName,
      });
      messages.$jazz.set(msg.$jazz.id, msg);

      return { messageId: MessageId.parse(msg.$jazz.id) };
    },

    createQueueHandler(
      queueNamePrefix: QueuePrefix,
      handler: (
        message: unknown,
        meta: {
          attempt: number;
          queueName: ValidQueueName;
          messageId: MessageId;
        }
        // biome-ignore lint/suspicious/noConfusingVoidType: it is what it is
      ) => Promise<void | { timeoutSeconds: number }>
    ): (req: Request) => Promise<Response> {
      return async (req) => {
        let coValueId: string;
        try {
          const body = await req.json();
          const webhookPayload = JazzWebhookPayload.parse(body);
          coValueId = webhookPayload.coValueId;
        } catch (error) {
          console.error('Failed to parse webhook payload:', error);
          return new Response('Bad Request', { status: 400 });
        }

        const messages = await JazzQueueMessages.load(coValueId, {
          resolve: {
            $each: true,
          },
        });
        if (!messages) {
          console.error('Queue messages not found for coValueId', coValueId);
          return Response.json(
            { error: 'Queue messages not found' },
            { status: 404 }
          );
        }

        // Temporary: find an unprocessed message
        let message: JazzQueueMessage | undefined;
        for (const msg of Object.values(messages)) {
          if (msg.processedAt || processedMessages.has(msg.$jazz.id)) {
            continue;
          }
          message = msg;
          processedMessages.add(msg.$jazz.id);
          break;
        }
        if (!message) {
          return Response.json(
            { error: 'No messages to process' },
            { status: 200 }
          );
        }
        if (!message.queueName.startsWith(queueNamePrefix)) {
          return Response.json({ error: 'Unhandled queue' }, { status: 400 });
        }

        try {
          const response = await handler(message.message, {
            attempt: 1,
            queueName: message.queueName,
            messageId: MessageId.parse(message.$jazz.id),
          });
          const retryIn =
            typeof response === 'undefined' ? null : response.timeoutSeconds;

          if (retryIn) {
            return Response.json({ retryIn }, { status: 503 });
          }

          message.$jazz.set('processedAt', new Date());
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Failed to process message:', error);
          processedMessages.delete(message.$jazz.id);
          return Response.json(String(error), { status: 500 });
        }
      };
    },
  };
};
