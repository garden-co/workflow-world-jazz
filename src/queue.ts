import {
  MessageId,
  parseQueueName,
  type Queue,
  type QueuePrefix,
  type ValidQueueName,
  WORKFLOW_FLOW_ROUTE,
} from '@workflow/world';
import { co, z } from 'jazz-tools';
import { registerWebhook } from 'jazz-webhook';
import { monotonicFactory } from 'ulid';
import { decodeEntry, encodeEntry } from './codec.js';
import {
  JazzQueue,
  JazzQueueMessage,
  JazzQueueMessages,
  type JazzWorldRoot,
} from './types.js';

/** Delay before redelivering a message whose handler threw, in seconds. */
function retryDelaySeconds(attempt: number) {
  return Math.min(2 ** attempt, 60);
}

const JazzWebhookPayload = z.object({
  coValueId: z.string(),
  txID: z.object({
    sessionID: z.string(),
    txIndex: z.number(),
  }),
});

/**
 * Messages live in one CoList per queue name. The Jazz webhook registry
 * watches each list and POSTs every appended message to the app, which is
 * how a deployment without a long-running consumer still gets invoked.
 *
 * The registry gives up on a delivery after a few failed attempts, so this
 * queue never leaves a retry to it: a handler error or a `timeoutSeconds`
 * result appends a fresh copy of the message (same `messageId`) with a
 * delivery time, and the failed delivery is acknowledged.
 */
export function createQueue(
  deps: {
    root: () => Promise<JazzWorldRoot>;
    sync: () => Promise<void>;
  },
  webhookEndpoint: string,
  webhookRegistryId: string
): Queue {
  const ulid = monotonicFactory();
  const routes = new Map<string, string>();
  const inFlight = new Set<string>();

  const routeFor = (queueName: string) => {
    const { prefix } = parseQueueName(queueName as ValidQueueName);
    return routes.get(prefix) ?? WORKFLOW_FLOW_ROUTE;
  };

  const loadQueue = async (queueName: string) => {
    const webhookUrl = `${webhookEndpoint.replace(/\/$/, '')}${routeFor(queueName)}`;
    // Keyed by endpoint too: a webhook is registered once per list, so a
    // second app on another URL needs lists of its own.
    const key = `${queueName} ${webhookUrl}`;
    const { queues } = await deps.root();
    const existing = queues.$jazz.refs[key]?.id;
    if (existing) {
      const queue = await JazzQueue.load(existing, {
        resolve: { messages: true, idempotencyKeys: true },
      });
      if (!queue.$isLoaded) throw new Error(`Queue ${queueName} not found`);
      return queue;
    }
    const owner = queues.$jazz.owner;
    const queue = JazzQueue.create(
      {
        name: queueName,
        webhookUrl,
        messages: JazzQueueMessages.create([], owner),
        idempotencyKeys: co.record(z.string(), z.string()).create({}, owner),
      },
      owner
    );
    queues.$jazz.set(key, queue);
    await registerWebhook({
      coValueId: queue.messages.$jazz.id,
      webhookUrl,
      registryId: webhookRegistryId,
    });
    return queue;
  };

  const enqueue = async (
    queueName: string,
    payload: unknown,
    options: {
      messageId?: string;
      attempt?: number;
      deploymentId?: string;
      idempotencyKey?: string;
      delaySeconds?: number;
    }
  ): Promise<string> => {
    const queue = await loadQueue(queueName);
    const { idempotencyKey } = options;
    if (idempotencyKey) {
      const existing = queue.idempotencyKeys[idempotencyKey];
      if (existing) return existing;
    }
    const owner = queue.$jazz.owner;
    const messageId = options.messageId ?? `msg_${ulid()}`;
    const now = new Date();
    const message = JazzQueueMessage.create(
      {
        messageId,
        queueName,
        payload: encodeEntry(payload, owner),
        deploymentId: options.deploymentId,
        idempotencyKey,
        notBefore: options.delaySeconds
          ? new Date(now.getTime() + options.delaySeconds * 1000)
          : undefined,
        attempt: options.attempt ?? 1,
        createdAt: now,
      },
      owner
    );
    queue.messages.$jazz.push(message);
    if (idempotencyKey) queue.idempotencyKeys.$jazz.set(idempotencyKey, messageId);
    await deps.sync();
    return messageId;
  };

  return {
    async getDeploymentId() {
      return 'dpl_jazz';
    },

    registerRoute(prefix, path) {
      routes.set(prefix, path);
    },

    async queue(queueName, message, opts) {
      const messageId = await enqueue(queueName, message, {
        deploymentId: opts?.deploymentId,
        idempotencyKey: opts?.idempotencyKey,
        delaySeconds: opts?.delaySeconds,
      });
      return { messageId: MessageId.parse(messageId) };
    },

    createQueueHandler(queueNamePrefix: QueuePrefix, handler) {
      return async (req) => {
        let body: z.infer<typeof JazzWebhookPayload>;
        try {
          body = JazzWebhookPayload.parse(await req.json());
        } catch {
          return Response.json({ error: 'Bad Request' }, { status: 400 });
        }

        const message = await loadDeliveredMessage(body);
        if (!message) {
          // Nothing to deliver, and retrying will not change that.
          return Response.json({ ok: true, ignored: true });
        }
        if (
          message.processedAt ||
          !message.queueName.startsWith(queueNamePrefix)
        ) {
          return Response.json({ ok: true, ignored: true });
        }

        const now = Date.now();
        if (message.notBefore && message.notBefore.getTime() > now) {
          return retryAfter((message.notBefore.getTime() - now) / 1000);
        }

        // The registry can deliver one message twice, for example after it
        // restarts with a delivery still in flight.
        const key = message.$jazz.id;
        if (inFlight.has(key)) return retryAfter(5);
        inFlight.add(key);
        try {
          const payload = await decodeEntry(message.payload);
          let outcome: unknown;
          try {
            outcome = await handler(payload, {
              attempt: message.attempt,
              createdAt: message.createdAt,
              queueName: message.queueName as ValidQueueName,
              messageId: MessageId.parse(message.messageId),
            });
          } catch (error) {
            console.error(
              `[workflow-world-jazz] handler failed for ${message.messageId} (attempt ${message.attempt}):`,
              error
            );
            await enqueue(message.queueName, payload, {
              messageId: message.messageId,
              attempt: message.attempt + 1,
              deploymentId: message.deploymentId,
              delaySeconds: retryDelaySeconds(message.attempt),
            });
            message.$jazz.set('processedAt', new Date());
            await deps.sync();
            return Response.json({ ok: true, retried: true });
          }

          const timeoutSeconds = (outcome as { timeoutSeconds?: unknown })
            ?.timeoutSeconds;
          if (typeof timeoutSeconds === 'number' && timeoutSeconds >= 0) {
            await enqueue(message.queueName, payload, {
              messageId: message.messageId,
              deploymentId: message.deploymentId,
              delaySeconds: timeoutSeconds,
            });
          }
          message.$jazz.set('processedAt', new Date());
          await deps.sync();
          return Response.json({ ok: true });
        } finally {
          inFlight.delete(key);
        }
      };
    },
  };
}

function retryAfter(seconds: number) {
  return Response.json(
    { retry: true },
    {
      status: 503,
      headers: { 'Retry-After': Math.max(1, Math.ceil(seconds)).toString() },
    }
  );
}

/**
 * The registry identifies a delivery by the transaction that appended the
 * message. That transaction's single change is the insert of the message's
 * CoValue id into the list.
 */
async function loadDeliveredMessage(body: z.infer<typeof JazzWebhookPayload>) {
  const messages = await JazzQueueMessages.load(body.coValueId);
  if (!messages.$isLoaded) return undefined;
  const transactions = messages.$jazz.raw.core.verifiedTransactions;
  for (let i = transactions.length - 1; i >= 0; i--) {
    const tx = transactions[i];
    if (
      tx.txID.sessionID !== body.txID.sessionID ||
      tx.txID.txIndex !== body.txID.txIndex
    ) {
      continue;
    }
    const change = tx.changes?.[0] as { op?: string; value?: unknown } | undefined;
    if (tx.changes?.length !== 1 || change?.op !== 'app') return undefined;
    if (typeof change.value !== 'string') return undefined;
    const message = await JazzQueueMessage.load(change.value);
    return message.$isLoaded ? message : undefined;
  }
  return undefined;
}
