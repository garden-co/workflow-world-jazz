import { z } from 'zod/v4';

export const QueuePrefix = z.union([
  z.literal('__wkf_step_'),
  z.literal('__wkf_workflow_'),
]);
export type QueuePrefix = z.infer<typeof QueuePrefix>;

export const ValidQueueName = z.templateLiteral([QueuePrefix, z.string()]);
export type ValidQueueName = z.infer<typeof ValidQueueName>;

export const MessageId = z
  .string()
  .brand<'MessageId'>()
  .describe('A stored queue message ID');
export type MessageId = z.infer<typeof MessageId>;

export interface Queue {
  getDeploymentId(): Promise<string>;

  /**
   * Enqueues a message to the specified queue.
   */
  queue(
    queueName: ValidQueueName,
    message: unknown,
    opts?: {
      deploymentId?: string;
      idempotencyKey?: string;
    }
  ): Promise<{ messageId: MessageId }>;

  /**
   * Creates an HTTP queue handler for processing messages from a specific queue.
   */
  createQueueHandler(
    queueNamePrefix: QueuePrefix,
    handler: (
      message: unknown,
      meta: { attempt: number; queueName: ValidQueueName; messageId: MessageId }
      // biome-ignore lint/suspicious/noConfusingVoidType: it is what it is
    ) => Promise<void | { timeoutSeconds: number }>
  ): (req: Request) => Promise<Response>;
}
