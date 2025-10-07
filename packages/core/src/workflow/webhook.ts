import type { WebhookRequestEvent } from '@vercel/workflow-world';
import type { JSONSchema7 } from 'json-schema';
import z from 'zod';
import { EventConsumerResult } from '../events-consumer.js';
import type { Webhook, WebhookOptions, WebhookSchema } from '../get-webhook.js';
import { WorkflowSuspension } from '../global.js';
import { webhookLogger } from '../logger.js';
import type { WorkflowOrchestratorContext } from '../private.js';
import { hydrateStepReturnValue } from '../serialization.js';
import { type PromiseWithResolvers, withResolvers } from '../util.js';

function toJSONSchema(
  schema: WebhookSchema | undefined
): JSONSchema7 | undefined {
  if (!schema) {
    return undefined;
  }
  if (schema instanceof z.ZodType) {
    return z.toJSONSchema(schema, { io: 'input' }) as JSONSchema7;
  }
  if (
    schema &&
    'toJSONSchema' in schema &&
    typeof schema.toJSONSchema === 'function'
  ) {
    return schema.toJSONSchema();
  }
  return schema as JSONSchema7;
}

function toJSONSchemaRecord(
  schemaRecord: Record<string, WebhookSchema> | undefined
): Record<string, JSONSchema7> | undefined {
  if (!schemaRecord) {
    return undefined;
  }

  const result: Record<string, JSONSchema7> = {};
  for (const [key, schema] of Object.entries(schemaRecord)) {
    const jsonSchema = toJSONSchema(schema);
    if (jsonSchema) {
      result[key] = jsonSchema;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

export function createGetWebhook(ctx: WorkflowOrchestratorContext) {
  return function getWebhook(options: WebhookOptions = {}): Webhook {
    const { url } = ctx;

    // `options.url` is a pathname, not a full URL
    if (options.url && !options.url.startsWith('/')) {
      throw new Error('Webhook URL must start with a slash.');
    }

    // Deterministically generated webhook ID for this webhook
    const webhookId = ctx.generateUlid();
    const correlationId = `wbhk_${webhookId}`;

    // Add webhook creation to invocations queue instead of creating immediately
    // This ensures proper replay behavior and idempotency
    ctx.invocationsQueue.push({
      type: 'webhook',
      correlationId,
      url: options.url,
      allowedMethods: options.method
        ? typeof options.method === 'string'
          ? [options.method]
          : options.method
        : ['POST'],
      headersSchema: toJSONSchemaRecord(options.headers),
      searchParamsSchema: toJSONSchemaRecord(options.searchParams),
      bodySchema: toJSONSchema(options.body),
    });

    // Construct the webhook URL using the webhook ID
    const pathname =
      options.url ?? `/api/webhook/${encodeURIComponent(webhookId)}`;
    const webhookUrl = new URL(pathname, url);

    // Queue of webhook events that have been received but not yet processed
    const requestsQueue: WebhookRequestEvent[] = [];

    // Queue of promises that resolve to the next webhook request
    const promises: PromiseWithResolvers<Request>[] = [];

    let eventLogEmpty = false;

    webhookLogger.debug('Webhook consumer setup', { correlationId });
    ctx.eventsConsumer.subscribe((event) => {
      // If there are no events and there are promises waiting,
      // it means the webhook has been awaited, but an incoming request has not yet been received on the webhook URL.
      // In this case, the workflow should be suspended until the webhook is called.
      if (!event) {
        eventLogEmpty = true;

        if (promises.length > 0) {
          setTimeout(() => {
            ctx.onWorkflowError(
              new WorkflowSuspension(ctx.invocationsQueue, ctx.globalThis)
            );
          }, 0);
          return EventConsumerResult.Finished;
        }
      }

      // TODO: enable debug mode logging - this line is quite helpful for debugging the runtime
      // console.log(
      //   `WEBHOOK CONSUMER ${correlationId}\n`,
      //   `->  incoming ${event?.correlationId}${correlationId === event?.correlationId ? ' match' : ''}\n`,
      //   `->  eventType: ${event?.eventType}\n`
      // );

      // Check for webhook_created event to remove this webhook from the queue if it was already created
      if (
        event?.eventType === 'webhook_created' &&
        event.correlationId === correlationId
      ) {
        // Remove this webhook from the invocations queue if it exists
        const index = ctx.invocationsQueue.findIndex(
          (item) =>
            item.type === 'webhook' && item.correlationId === correlationId
        );
        if (index !== -1) {
          ctx.invocationsQueue.splice(index, 1);
        }
        return EventConsumerResult.Consumed;
      }

      if (
        event?.eventType === 'webhook_request' &&
        event.correlationId === correlationId
      ) {
        if (promises.length > 0) {
          const next = promises.shift();
          if (next) {
            // Reconstruct the Request object from the event data
            const request = hydrateStepReturnValue(
              event.eventData.request,
              ctx.globalThis
            );
            next.resolve(request);
          }
        } else {
          requestsQueue.push(event);
        }

        return EventConsumerResult.Consumed;
      }

      return EventConsumerResult.NotConsumed;
    });

    // Helper function to create a new promise that waits for the next webhook call
    function createWebhookPromise(): Promise<Request> {
      const resolvers = withResolvers<Request>();
      if (requestsQueue.length > 0) {
        const nextRequest = requestsQueue.shift();
        if (nextRequest) {
          const request = hydrateStepReturnValue(
            nextRequest.eventData.request,
            ctx.globalThis
          );
          resolvers.resolve(request);
          return resolvers.promise;
        }
      }

      if (eventLogEmpty) {
        // If the event log is already empty then we know the webhook will not be resolved.
        // Treat this case as a "step not run" scenario and suspend the workflow.
        setTimeout(() => {
          ctx.onWorkflowError(
            new WorkflowSuspension(ctx.invocationsQueue, ctx.globalThis)
          );
        }, 0);
      }

      promises.push(resolvers);

      return resolvers.promise;
    }

    const webhook: Webhook = {
      url: webhookUrl.href,

      // biome-ignore lint/suspicious/noThenProperty: Intentionally thenable
      then<TResult1 = Request, TResult2 = never>(
        onfulfilled?:
          | ((value: Request) => TResult1 | PromiseLike<TResult1>)
          | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
      ): Promise<TResult1 | TResult2> {
        return createWebhookPromise().then(onfulfilled, onrejected);
      },

      // Support `for await (const req of webhook) { … }` syntax
      async *[Symbol.asyncIterator]() {
        while (true) {
          yield await this;
        }
      },
    };

    return webhook;
  };
}
