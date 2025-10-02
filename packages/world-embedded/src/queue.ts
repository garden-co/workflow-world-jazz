import { JsonTransport } from '@vercel/queue';
import { setTimeout } from 'node:timers/promises';
import z from 'zod';
import { MessageId, type Queue, ValidQueueName } from '@vercel/workflow-world';

export function createQueue(port?: number): Queue {
  const transport = new JsonTransport();

  const queue: Queue['queue'] = async (queueName, x) => {
    const body = transport.serialize(x);
    let pathname: string;
    if (queueName.startsWith('__wkf_step_')) {
      pathname = `step`;
    } else if (queueName.startsWith('__wkf_workflow_')) {
      pathname = `flow`;
    } else {
      throw new Error('Unknown queue name prefix');
    }
    const messageId = MessageId.parse(`msg_${crypto.randomUUID()}`);

    (async () => {
      let defaultRetriesLeft = 3;
      for (let attempt = 0; defaultRetriesLeft > 0; attempt++) {
        defaultRetriesLeft--;
        const response = await fetch(
          `http://localhost:${port}/.well-known/workflow/v1/${pathname}`,
          {
            method: 'POST',
            duplex: 'half',
            headers: {
              'x-vqs-queue-name': queueName,
              'x-vqs-message-id': messageId,
              'x-vqs-message-attempt': String(attempt + 1),
            },
            body,
          }
        );

        if (response.ok) {
          return;
        }

        const text = await response.text();

        if (response.status === 503) {
          try {
            const retryIn = Number(JSON.parse(text).retryIn);
            await setTimeout(retryIn * 1000);
            defaultRetriesLeft++;
            continue;
          } catch {}
        }

        console.error(`[embedded world] Failed to queue message`, {
          queueName,
          text,
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: body.toString(),
        });
      }

      console.error(`No more retries`);
    })();

    return { messageId };
  };

  const HeaderParser = z.object({
    'x-vqs-queue-name': ValidQueueName,
    'x-vqs-message-id': MessageId,
    'x-vqs-message-attempt': z.coerce.number(),
  });

  const createQueueHandler: Queue['createQueueHandler'] = (prefix, handler) => {
    return async (req) => {
      const headers = HeaderParser.safeParse(Object.fromEntries(req.headers));

      if (!headers.success || !req.body) {
        return Response.json(
          { error: 'Missing required headers' },
          { status: 400 }
        );
      }

      const queueName = headers.data['x-vqs-queue-name'];
      const messageId = headers.data['x-vqs-message-id'];
      const attempt = headers.data['x-vqs-message-attempt'];

      if (!queueName.startsWith(prefix)) {
        return Response.json({ error: 'Unhandled queue' }, { status: 400 });
      }

      const body = await new JsonTransport().deserialize(req.body);
      try {
        const response = await handler(body, { attempt, queueName, messageId });
        const retryIn =
          typeof response === 'undefined' ? null : response.timeoutSeconds;

        if (retryIn) {
          return Response.json({ retryIn }, { status: 503 });
        }

        return Response.json({ ok: true });
      } catch (error) {
        return Response.json(String(error), { status: 500 });
      }
    };
  };

  const getDeploymentId: Queue['getDeploymentId'] = async () => {
    return 'dpl_embedded';
  };

  return { queue, createQueueHandler, getDeploymentId };
}
