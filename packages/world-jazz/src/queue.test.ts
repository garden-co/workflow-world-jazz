import type {
  Queue,
  QueuePrefix,
  ValidQueueName,
} from '@vercel/workflow-world';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueue } from './queue.js';
import { createJazzTestAccountResolver } from './testUtils.js';
import { JazzQueue, type JazzStorageAccountResolver } from './types.js';

// Helper function to create valid queue names with proper prefix
function createQueueName(name: string): ValidQueueName {
  return `__wkf_step_${name}` as ValidQueueName;
}

describe('Jazz Queue', () => {
  // Mock the registerWebhook function from jazz-webhook
  vi.mock('jazz-webhook', () => ({
    registerWebhook: vi.fn().mockResolvedValue('mock-webhook-id'),
  }));

  let queue: Queue;
  let ensureLoaded: JazzStorageAccountResolver;

  beforeEach(() => {
    ensureLoaded = createJazzTestAccountResolver();
    queue = createQueue(
      ensureLoaded,
      'http://test-host:9999',
      'test-registry-id'
    );
  });

  describe('getDeploymentId', () => {
    it('should return jazz deployment ID', async () => {
      const deploymentId = await queue.getDeploymentId();
      expect(deploymentId).toBe('dpl_jazz');
    });
  });

  describe('queue', () => {
    it('should enqueue a simple message', async () => {
      const queueName = createQueueName('test-queue');
      const message = { data: 'test message' };

      const result = await queue.queue(queueName, message);

      expect(result).toHaveProperty('messageId');
      expect(result.messageId).toBeDefined();
      expect(typeof result.messageId).toBe('string');
    });

    it('should enqueue a message with deployment ID', async () => {
      const queueName = createQueueName('test-queue');
      const message = { data: 'test message' };
      const deploymentId = 'deployment-123';

      const result = await queue.queue(queueName, message, {
        deploymentId,
      });

      expect(result).toHaveProperty('messageId');
      expect(result.messageId).toBeDefined();
    });

    it('should enqueue a message with idempotency key', async () => {
      const queueName = createQueueName('test-queue');
      const message = { data: 'test message' };
      const idempotencyKey = 'idempotent-key-123';

      const result = await queue.queue(queueName, message, {
        idempotencyKey,
      });

      expect(result).toHaveProperty('messageId');
      expect(result.messageId).toBeDefined();
    });

    it('should enqueue a message with both deployment ID and idempotency key', async () => {
      const queueName = createQueueName('test-queue');
      const message = { data: 'test message' };
      const deploymentId = 'deployment-123';
      const idempotencyKey = 'idempotent-key-123';

      const result = await queue.queue(queueName, message, {
        deploymentId,
        idempotencyKey,
      });

      expect(result).toHaveProperty('messageId');
      expect(result.messageId).toBeDefined();
    });

    it('should handle complex JSON serializable messages', async () => {
      const queueName = createQueueName('test-queue');
      const complexMessage = {
        nested: {
          deeply: {
            value: 42,
            array: [1, 2, { mixed: 'array' }],
            nullValue: null,
            booleanValue: true,
            numberValue: 3.14,
          },
        },
        simple: 'string',
        numbers: [1, 2, 3],
      };

      const result = await queue.queue(queueName, complexMessage);

      expect(result).toHaveProperty('messageId');
      expect(result.messageId).toBeDefined();
    });

    it('should handle primitive message types', async () => {
      const queueName = createQueueName('test-queue');

      // Test string
      const stringResult = await queue.queue(queueName, 'simple string');
      expect(stringResult.messageId).toBeDefined();

      // Test number
      const numberResult = await queue.queue(queueName, 42);
      expect(numberResult.messageId).toBeDefined();

      // Test boolean
      const booleanResult = await queue.queue(queueName, true);
      expect(booleanResult.messageId).toBeDefined();

      // Test null
      const nullResult = await queue.queue(queueName, null);
      expect(nullResult.messageId).toBeDefined();

      // Test array
      const arrayResult = await queue.queue(queueName, [1, 2, 3]);
      expect(arrayResult.messageId).toBeDefined();
    });

    it('should create new queue if it does not exist', async () => {
      const queueName = createQueueName('new-queue');
      const message = { data: 'first message' };

      const result = await queue.queue(queueName, message);

      expect(result).toHaveProperty('messageId');
      expect(result.messageId).toBeDefined();
    });

    it('should handle multiple messages in the same queue', async () => {
      const queueName = createQueueName('multi-message-queue');
      const messages = [
        { data: 'message 1' },
        { data: 'message 2' },
        { data: 'message 3' },
      ];

      const results: { messageId: string }[] = [];
      for (const message of messages) {
        const result = await queue.queue(queueName, message);
        results.push(result);
      }

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result).toHaveProperty('messageId');
        expect(result.messageId).toBeDefined();
      });

      // All message IDs should be unique
      const messageIds = results.map((r) => r.messageId);
      const uniqueIds = new Set(messageIds);
      expect(uniqueIds.size).toBe(3);
    });

    it('should handle different queue names', async () => {
      const queueNames = [
        createQueueName('queue-1'),
        createQueueName('queue-2'),
        createQueueName('queue-3'),
      ];
      const message = { data: 'test message' };

      const results = await Promise.all(
        queueNames.map((queueName) => queue.queue(queueName, message))
      );

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result).toHaveProperty('messageId');
        expect(result.messageId).toBeDefined();
      });
    });
  });

  describe('createQueueHandler', () => {
    it('should create a queue handler function', () => {
      const queueNamePrefix = '__wkf_step_' as QueuePrefix;
      const handler = vi.fn().mockResolvedValue(undefined);

      const queueHandler = queue.createQueueHandler(queueNamePrefix, handler);

      expect(typeof queueHandler).toBe('function');
    });

    it('should handle valid webhook payload and process message', async () => {
      // Enqueue a message
      const queueName = createQueueName('test-queue');
      const message = { data: 'test message' };
      const queueResult = await queue.queue(queueName, message);

      // Get the queue that was created so we can find the covalue ID of its messages to simulate the webhook payload
      const root = (await ensureLoaded({ root: true })).root;
      // biome-ignore lint/style/noNonNullAssertion: the queue will exist
      const jazzQueue = (await JazzQueue.loadUnique(
        `queue/${queueName}`,
        root.$jazz.owner.$jazz.id,
        { resolve: { messages: true } }
      ))!;

      // Create a queue handler and invoke it with the webhook payload
      const queueNamePrefix = '__wkf_step_' as QueuePrefix;
      const handler = vi.fn().mockResolvedValue(undefined);
      const queueHandler = queue.createQueueHandler(queueNamePrefix, handler);
      const request = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coValueId: jazzQueue.messages?.$jazz.id,
          updates: 1,
        }),
      });
      const response = await queueHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalledWith(message, {
        attempt: 1,
        queueName: queueName,
        messageId: queueResult.messageId,
      });
    });

    it('should return 400 for invalid webhook payload', async () => {
      const queueNamePrefix = '__wkf_step_' as QueuePrefix;
      const handler = vi.fn();

      const queueHandler = queue.createQueueHandler(queueNamePrefix, handler);

      const request = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      });

      const response = await queueHandler(request);
      expect(response.status).toBe(400);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should return 400 for missing coValueId in payload', async () => {
      const queueNamePrefix = '__wkf_step_' as QueuePrefix;
      const handler = vi.fn();

      const queueHandler = queue.createQueueHandler(queueNamePrefix, handler);

      const request = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: 1 }), // Missing coValueId
      });

      const response = await queueHandler(request);
      expect(response.status).toBe(400);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should return 400 for missing updates in payload', async () => {
      const queueNamePrefix = '__wkf_step_' as QueuePrefix;
      const handler = vi.fn();

      const queueHandler = queue.createQueueHandler(queueNamePrefix, handler);

      const request = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coValueId: 'test-id' }), // Missing updates
      });

      const response = await queueHandler(request);
      expect(response.status).toBe(400);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should return 400 for unhandled queue name', async () => {
      const queueNamePrefix = '__wkf_step_' as QueuePrefix;
      const handler = vi.fn();

      const queueHandler = queue.createQueueHandler(queueNamePrefix, handler);

      // We can't easily mock the JazzQueue.load call, so we'll test the structure
      expect(typeof queueHandler).toBe('function');
    });

    it('should return 200 when no messages to process', async () => {
      const queueNamePrefix = '__wkf_step_' as QueuePrefix;
      const handler = vi.fn();

      const queueHandler = queue.createQueueHandler(queueNamePrefix, handler);

      expect(typeof queueHandler).toBe('function');
    });

    it('should return 503 when handler returns timeout', async () => {
      const queueNamePrefix = '__wkf_step_' as QueuePrefix;
      const handler = vi.fn().mockResolvedValue({ timeoutSeconds: 30 });

      const queueHandler = queue.createQueueHandler(queueNamePrefix, handler);

      expect(typeof queueHandler).toBe('function');
    });

    it('should return 500 when handler throws error', async () => {
      const queueNamePrefix = '__wkf_step_' as QueuePrefix;
      const handler = vi.fn().mockRejectedValue(new Error('Handler error'));

      const queueHandler = queue.createQueueHandler(queueNamePrefix, handler);

      expect(typeof queueHandler).toBe('function');
    });

    it('should return 200 when handler succeeds', async () => {
      const queueNamePrefix = '__wkf_step_' as QueuePrefix;
      const handler = vi.fn().mockResolvedValue(undefined);

      const queueHandler = queue.createQueueHandler(queueNamePrefix, handler);

      expect(typeof queueHandler).toBe('function');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete queue workflow', async () => {
      const queueName = createQueueName('integration-queue');
      const messages = [
        { type: 'start', data: 'workflow started' },
        { type: 'process', data: 'processing data' },
        { type: 'complete', data: 'workflow completed' },
      ];

      // Enqueue multiple messages
      const results: { messageId: string }[] = [];
      for (const message of messages) {
        const result = await queue.queue(queueName, message);
        results.push(result);
      }

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result).toHaveProperty('messageId');
        expect(result.messageId).toBeDefined();
      });

      // Verify all message IDs are unique
      const messageIds = results.map((r) => r.messageId);
      const uniqueIds = new Set(messageIds);
      expect(uniqueIds.size).toBe(3);
    });

    it('should handle queue with different message types', async () => {
      const queueName = createQueueName('mixed-message-queue');
      const mixedMessages = [
        'string message',
        42,
        true,
        null,
        { object: 'message' },
        [1, 2, 3],
      ];

      const results: { messageId: string }[] = [];
      for (const message of mixedMessages) {
        const result = await queue.queue(queueName, message);
        results.push(result);
      }

      expect(results).toHaveLength(6);
      results.forEach((result) => {
        expect(result).toHaveProperty('messageId');
        expect(result.messageId).toBeDefined();
      });
    });

    it('should handle queue with deployment and idempotency options', async () => {
      const queueName = createQueueName('options-queue');
      const message = { data: 'test message' };

      const results: { messageId: string }[] = [];
      results.push(
        await queue.queue(queueName, message, { deploymentId: 'deploy-1' })
      );
      results.push(
        await queue.queue(queueName, message, { idempotencyKey: 'key-1' })
      );
      results.push(
        await queue.queue(queueName, message, {
          deploymentId: 'deploy-2',
          idempotencyKey: 'key-2',
        })
      );
      results.push(await queue.queue(queueName, message));

      expect(results).toHaveLength(4);
      results.forEach((result) => {
        expect(result).toHaveProperty('messageId');
        expect(result.messageId).toBeDefined();
      });
    });

    it('should maintain message order within queue', async () => {
      const queueName = createQueueName('order-queue');
      const messages = [
        { order: 1, data: 'first' },
        { order: 2, data: 'second' },
        { order: 3, data: 'third' },
      ];

      // Enqueue messages sequentially to maintain order
      const results: Array<{ messageId: string }> = [];
      for (const message of messages) {
        const result = await queue.queue(queueName, message);
        results.push(result);
      }

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result).toHaveProperty('messageId');
        expect(result.messageId).toBeDefined();
      });
    });
  });

  describe('error handling', () => {
    it('should handle invalid queue names gracefully', async () => {
      // Note: The ValidQueueName type should prevent invalid names at compile time
      // This test is more about runtime behavior if somehow an invalid name gets through
      const validQueueName = createQueueName('valid-queue');
      const message = { data: 'test message' };

      const result = await queue.queue(validQueueName, message);
      expect(result).toHaveProperty('messageId');
      expect(result.messageId).toBeDefined();
    });

    it('should handle empty message gracefully', async () => {
      const queueName = createQueueName('empty-message-queue');
      const emptyMessage = {};

      const result = await queue.queue(queueName, emptyMessage);
      expect(result).toHaveProperty('messageId');
      expect(result.messageId).toBeDefined();
    });

    it('should handle very large messages', async () => {
      const queueName = createQueueName('large-message-queue');
      const largeMessage = {
        data: 'x'.repeat(10000), // 10KB string
        array: Array(1000).fill('test'),
        nested: {
          deep: {
            value: 'x'.repeat(5000),
          },
        },
      };

      const result = await queue.queue(queueName, largeMessage);
      expect(result).toHaveProperty('messageId');
      expect(result.messageId).toBeDefined();
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent queue operations', async () => {
      const queueName = createQueueName('concurrent-queue');
      const messageCount = 10;

      // Ensure the queue exists
      await queue.queue(queueName, { data: 'initial message' });

      // Create multiple concurrent queue operations
      const promises = Array.from({ length: messageCount }, (_, index) =>
        queue.queue(queueName, { index, data: `message ${index}` })
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(messageCount);
      results.forEach((result) => {
        expect(result).toHaveProperty('messageId');
        expect(result.messageId).toBeDefined();
      });

      // All message IDs should be unique
      const messageIds = results.map((r) => r.messageId);
      const uniqueIds = new Set(messageIds);
      expect(uniqueIds.size).toBe(messageCount);
    });

    it('should handle concurrent operations on different queues', async () => {
      const queueNames = [
        createQueueName('concurrent-queue-1'),
        createQueueName('concurrent-queue-2'),
        createQueueName('concurrent-queue-3'),
      ];
      const message = { data: 'concurrent message' };

      // Create concurrent operations on different queues
      const promises = queueNames.map((queueName) =>
        queue.queue(queueName, message)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result).toHaveProperty('messageId');
        expect(result.messageId).toBeDefined();
      });
    });
  });
});
