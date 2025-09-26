import { createJazzWorld } from './world.js';

async function main() {
  const world = createJazzWorld();

  // const run = await world.runs.create({
  //   deploymentId: '123',
  //   workflowName: 'test',
  //   input: [],
  //   executionContext: {},
  // });
  // console.log(run);

  // console.log('Listing runs:');
  // const runs = await world.runs.list({
  //   pagination: {
  //     limit: 3,
  //     // cursor: 'co_zMn4y22CM6nGn9NGRTUiYKAKvWY',
  //   },
  // });
  // runs.data.forEach((run) => {
  //   console.log(run.runId);
  // });
  // console.log('cursor', runs.cursor);
  // console.log('hasMore', runs.hasMore);
  // console.log('\n');

  // const step = await world.steps.create(runs.data[0].runId, {
  //   stepId: '1',
  //   stepName: 'test',
  //   input: [],
  // });
  // console.log(step);

  // if (runs.data.length > 0) {
  //   console.log('Listing steps:');
  //   const steps = await world.steps.list({
  //     runId: runs.data[0].runId,
  //     pagination: {
  //       limit: 1,
  //     },
  //   });
  //   steps.data.forEach((step) => {
  //     console.log(step.stepId);
  //   });
  //   console.log('cursor', steps.cursor);
  //   console.log('hasMore', steps.hasMore);
  //   console.log('\n');
  // }

  // const webhook = await world.webhooks.create('run1', {
  //   webhookId: 'webhook1',
  //   url: 'https://example.com',
  //   allowedMethods: ['GET'],
  // });
  // console.log(webhook);

  // const webhook2 = await world.webhooks.get('webhook1', 'jazz');
  // console.log(webhook2);

  // const webhooks = await world.webhooks.getByUrl('https://example.com', 'jazz');
  // webhooks.data.forEach((webhook) => {
  //   console.log(webhook.webhookId, webhook.url);
  // });
  // console.log('cursor', webhooks.cursor);
  // console.log('hasMore', webhooks.hasMore);
  // console.log('\n');

  // await world.webhooks.dispose('webhook1', 'jazz');

  await world.events.create('run1', {
    eventType: 'step_completed',
    correlationId: '1',
    eventData: {
      result: { message: 'Hello, world!' },
    },
  });

  await world.events.create('run1', {
    eventType: 'step_failed',
    correlationId: '1',
    eventData: {
      error: { message: 'Hello, world!' },
      stack: 'Hello, world!',
      fatal: true,
    },
  });

  const events = await world.events.list({
    runId: 'run1',
    pagination: {
      limit: 10,
    },
  });
  console.log(events);

  events.data.forEach((event) => {
    console.log(JSON.stringify(event, null, 2));
  });

  await world.done();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
