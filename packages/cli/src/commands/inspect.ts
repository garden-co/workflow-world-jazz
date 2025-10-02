import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../base.js';
import { LOGGING_CONFIG } from '../lib/config/log.js';
import { cliFlags } from '../lib/inspect/flags.js';
import {
  listEvents,
  listRuns,
  listSteps,
  listStreams,
  showRun,
  showStep,
  showStream,
} from '../lib/inspect/output.js';
import { setupCliWorld } from '../lib/inspect/setup.js';

export default class Inspect extends BaseCommand {
  static description = 'Inspect runs, steps, streams, or events';

  static aliases = ['i'];

  static examples = [
    '$ workflow inspect runs',
    '$ wf i runs',
    '$ wf i events --step=step_01K5WAJZ8W367CV2RFKDSDNWB8',
  ];

  async catch(error: any) {
    if (LOGGING_CONFIG.VERBOSE_MODE) {
      console.error(error);
    }
    throw error;
  }

  static args = {
    resource: Args.string({
      description: 'what to inspect: run(s) | step(s) | stream(s) | event(s)',
      required: true,
      options: [
        'r',
        'run',
        'runs',
        's',
        'step',
        'steps',
        'e',
        'event',
        'events',
        'st',
        'stream',
        'streams',
      ],
    }),
    id: Args.string({
      description: 'ID of the resource if inspecting a specific item',
      required: false,
    }),
  } as const;

  static flags = {
    runId: Flags.string({
      description: 'run ID to filter by',
      required: false,
      char: 'r',
      aliases: ['run'],
      helpGroup: 'Filtering',
      helpLabel: '-r, --runId',
      helpValue: 'RUN_ID',
    }),
    stepId: Flags.string({
      description: 'step ID to filter by',
      required: false,
      char: 's',
      aliases: ['step'],
      helpGroup: 'Filtering',
      helpLabel: '-s, --stepId',
      helpValue: 'STEP_ID',
    }),
    ...cliFlags,
  } as const;

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Inspect);

    const world = await setupCliWorld(flags, this.config.version);

    const resource = normalizeResource(args.resource);
    if (!resource) {
      this.logError(
        `Unknown resource "${args.resource}": must be one of: run(s), step(s), stream(s), event(s)`
      );
      return;
    }

    const id = args.id;

    if (resource === 'run') {
      if (id) {
        return await showRun(world, id, flags);
      }
      return await listRuns(world, flags);
    }

    if (resource === 'step') {
      if (id) {
        return await showStep(world, id, flags);
      }
      return await listSteps(world, flags);
    }

    if (resource === 'stream') {
      if (id) {
        return await showStream(world, id, flags);
      }
      return await listStreams(world, flags);
    }

    if (resource === 'event') {
      if (id) {
        this.logError(
          'Event-ID is not supported for events. Filter by run-id or step-id instead. Usage: `wf i events --runId=<id>`'
        );
        return;
      }
      return await listEvents(world, flags);
    }

    this.logError(
      `Unknown resource: ${resource}. Usage: ${Inspect.examples.join('\n')}`
    );
  }
}

function normalizeResource(
  value?: string
): 'run' | 'step' | 'stream' | 'event' | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  if (v.startsWith('r')) return 'run';
  if (v.startsWith('e')) return 'event';
  if (v.startsWith('str')) return 'stream';
  if (v.startsWith('s')) return 'step';
  return undefined;
}
