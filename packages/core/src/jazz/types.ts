import { co, Group, z } from 'jazz-tools';
import { WorkflowRunSchema } from '../world/runs.js';
import { StepSchema } from '../world/steps.js';

export const JazzWorkflowRun = co.map({
  ...WorkflowRunSchema.omit({
    runId: true,
    input: true,
    output: true,
    executionContext: true,
  }).shape,
  executionContext: z.json(),
  input: z.array(z.json()),
  output: z.json().optional(),
});

export type JazzWorkflowRun = co.loaded<typeof JazzWorkflowRun>;

export const JazzStep = co.map({
  ...StepSchema.omit({ input: true, output: true }).shape,
  input: z.array(z.json()),
  output: z.json().optional(),
});

export type JazzStep = co.loaded<typeof JazzStep>;

export const JazzStorageRoot = co.map({
  runs: co.list(JazzWorkflowRun),
  steps: co.record(z.string(), co.list(JazzStep)),
});

export type JazzStorageRoot = co.loaded<typeof JazzStorageRoot>;

export const JazzStorageAccount = co
  .account({
    profile: co.profile(),
    root: JazzStorageRoot,
  })
  .withMigration((account) => {
    if (!account.$jazz.has('root')) {
      const defaultGroup = Group.create();
      const runs = co.list(JazzWorkflowRun).create([], { owner: defaultGroup });
      const steps = co
        .record(z.string(), co.list(JazzStep))
        .create({}, { owner: defaultGroup });
      account.$jazz.set('root', {
        runs,
        steps,
      });
    }
  });
