import type { World } from '@vercel/workflow-world';
import { start } from '../runtime.js';

interface CLICreateOpts {
  json?: boolean;
  verbose?: boolean;
}

const getWorkflowName = async (world: World, runNameOrId: string) => {
  if (runNameOrId.startsWith('wrun_')) {
    const run = await world.runs.get(runNameOrId);
    if (!run) {
      throw new Error(`Run ${runNameOrId} not found`);
    }
    return run.workflowName;
  }
  return runNameOrId;
};

export const startRun = async (
  world: World,
  workflowNameOrRunId: string,
  opts: CLICreateOpts,
  args: string[]
) => {
  const jsonArgs = args.map((arg) => JSON.parse(arg));
  const workflowId = await getWorkflowName(world, workflowNameOrRunId);
  const deploymentId = await world.getDeploymentId();

  const run = await start({ workflowId }, jsonArgs, { deploymentId });

  if (opts.json) {
    process.stdout.write(JSON.stringify(run, null, 2));
  } else {
    console.log(run);
  }
};
