import { handleCallback, send } from '@vercel/queue';
import { MessageId, type Queue, ValidQueueName } from '@vercel/workflow-world';

export function createQueue(): Queue {
  const queue: Queue['queue'] = async (queueName, x, opts) => {
    const { messageId } = await send(queueName, x, opts);
    return { messageId: MessageId.parse(messageId) };
  };

  const createQueueHandler: Queue['createQueueHandler'] = (prefix, handler) => {
    return handleCallback({
      [`${prefix}*`]: {
        default: (body, meta) => {
          return handler(body, {
            queueName: ValidQueueName.parse(meta.topicName),
            messageId: MessageId.parse(meta.messageId),
            attempt: meta.deliveryCount,
          });
        },
      },
    });
  };

  const getDeploymentId: Queue['getDeploymentId'] = async () => {
    const deploymentId = process.env.VERCEL_DEPLOYMENT_ID;
    if (!deploymentId) {
      throw new Error('VERCEL_DEPLOYMENT_ID environment variable is not set');
    }
    return deploymentId;
  };

  return { queue, createQueueHandler, getDeploymentId };
}
