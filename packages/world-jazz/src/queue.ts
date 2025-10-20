import {
  MessageId,
  type Queue,
  type QueuePrefix,
  type ValidQueueName,
} from '@vercel/workflow-world';
import { registerWebhook } from 'jazz-webhook';
import { z } from 'zod';
import {
  JazzQueue,
  JazzQueueMessage,
  JazzQueueMessages,
  type JazzStorageAccountResolver,
} from './types.js';

const JazzWebhookPayload = z.object({
  coValueId: z.string(),
  txID: z.object({
    sessionID: z.string(),
    txIndex: z.number(),
  }),
});

const InsertOp = z.object({
  op: z.literal('app'),
  value: z.string(),
});

export const createQueue = (
  ensureLoaded: JazzStorageAccountResolver,
  webhookEndpoint: string,
  webhookRegistryId: string
): Queue => {
  const processedMessages = new Set<string>();

  const loadOrCreateQueue = async (
    name: string,
    webhookPath: string
  ): Promise<JazzQueue> => {
    const root = (await ensureLoaded({ root: true })).root;

    const unique = `queue/${name}`;
    let jq = await JazzQueue.loadUnique(unique, root.$jazz.owner.$jazz.id);
    if (jq) {
      return jq;
    }

    const messages = JazzQueueMessages.create([]);
    jq = JazzQueue.create(
      {
        name: name as ValidQueueName,
        messages,
      },
      { unique, owner: root.$jazz.owner }
    );

    await registerWebhook({
      registryId: webhookRegistryId,
      webhookUrl: `${webhookEndpoint}/.well-known/workflow/v1/${webhookPath}`,
      coValueId: messages.$jazz.id,
    });

    return jq;
  };

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
      let webhookPath: string;
      if (queueName.startsWith('__wkf_step_')) {
        webhookPath = `step`;
      } else if (queueName.startsWith('__wkf_workflow_')) {
        webhookPath = `flow`;
      } else {
        throw new Error('Unknown queue name prefix');
      }

      const queue = await loadOrCreateQueue(queueName, webhookPath);

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
      messages.$jazz.push(msg);

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
        let txID: { sessionID: string; txIndex: number };
        try {
          const body = await req.json();
          const webhookPayload = JazzWebhookPayload.parse(body);
          coValueId = webhookPayload.coValueId;
          txID = webhookPayload.txID;
        } catch (error) {
          console.error('Failed to parse webhook payload:', error);
          return new Response('Bad Request', { status: 400 });
        }

        const messages = await JazzQueueMessages.load(coValueId);
        if (!messages) {
          console.error('Queue messages not found for coValueId', coValueId);
          return Response.json(
            { error: 'Queue messages not found' },
            { status: 404 }
          );
        }

        let verifiedTx;

        for (
          let i = messages.$jazz.raw.core.verifiedTransactions.length - 1;
          i >= 0;
          i--
        ) {
          const tx = messages.$jazz.raw.core.verifiedTransactions[i];
          if (
            tx.txID.sessionID === txID.sessionID &&
            tx.txID.txIndex === txID.txIndex
          ) {
            verifiedTx = tx;
            break;
          }
        }

        if (
          !verifiedTx ||
          !verifiedTx.changes ||
          verifiedTx.changes.length !== 1
        ) {
          return Response.json(
            {
              error:
                'Transaction not found, not decrypted, or has no or multiple changes',
            },
            { status: 404 }
          );
        }

        let messageInsert;
        try {
          messageInsert = InsertOp.parse(verifiedTx.changes[0]!);
        } catch (error) {
          return Response.json(
            { error: "Transaction doesn't contain an insert operation" },
            { status: 503 }
          );
        }

        const message = await JazzQueueMessage.load(messageInsert.value);
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
            return Response.json(
              {},
              {
                status: 503,
                headers: {
                  'Retry-After': retryIn.toString(),
                },
              }
            );
          }

          processedMessages.add(message.$jazz.id);
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
