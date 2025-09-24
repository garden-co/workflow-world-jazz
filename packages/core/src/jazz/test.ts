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

  console.log('Listing runs:');
  const runs = await world.runs.list({
    pagination: {
      limit: 3,
      // cursor: 'co_zMn4y22CM6nGn9NGRTUiYKAKvWY',
    },
  });
  runs.data.forEach((run) => {
    console.log(run.runId);
  });
  console.log('cursor', runs.cursor);
  console.log('hasMore', runs.hasMore);
  console.log('\n');

  // const step = await world.steps.create(runs.data[0].runId, {
  //   stepId: '1',
  //   stepName: 'test',
  //   input: [],
  // });
  // console.log(step);

  console.log('Listing steps:');
  const steps = await world.steps.list({
    runId: runs.data[0].runId,
    pagination: {
      limit: 1,
    },
  });
  steps.data.forEach((step) => {
    console.log(step.stepId);
  });
  console.log('cursor', steps.cursor);
  console.log('hasMore', steps.hasMore);
  console.log('\n');

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
