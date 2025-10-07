// This file contains methods to fetch information about workflows and steps,
// by using the "world" API from the core package.

import {
  hydrateStepArguments,
  hydrateStepReturnValue,
  hydrateWorkflowArguments,
  hydrateWorkflowReturnValue,
} from '@vercel/workflow-core/serialization';
import type { Event, Step, WorkflowRun, World } from '@vercel/workflow-world';
import chalk from 'chalk';
import { formatDistance } from 'date-fns';
import Table from 'easy-table';
import { logger } from '../config/log.js';
import type { InspectCLIOptions } from '../config/types.js';
import { getWorkflowReadableStream } from '../runtime.js';
import { streamToConsole } from './stream.js';

const DEFAULT_PAGINATION_LIMIT = 20;

class StreamID {
  constructor(public name: string | null) {}
  toString() {
    if (this.name === null) {
      return `strm_null`;
    }
    return chalk.green(this.name);
  }
  toJSON() {
    return this.name;
  }
}

const WORKFLOW_RUN_LISTED_PROPS: (keyof WorkflowRun)[] = [
  'runId',
  'workflowName',
  'status',
  'startedAt',
  'completedAt',
  'input',
  'output',
];

const STEP_LISTED_PROPS: (keyof Step)[] = [
  'runId',
  'stepId',
  'stepName',
  'status',
  'startedAt',
  'completedAt',
  'input',
  'output',
];

const EVENT_LISTED_PROPS: (keyof Event | 'eventData')[] = [
  'eventId',
  'eventType',
  'correlationId',
  'createdAt',
  'eventData',
];

const STATUS_COLORS: Record<
  WorkflowRun['status'] | Step['status'],
  (value: string) => string
> = {
  running: chalk.blue,
  completed: chalk.green,
  failed: chalk.red,
  cancelled: chalk.strikethrough.yellow,
  pending: chalk.blue,
  paused: chalk.yellow,
};

const showTable = (data: Record<string, unknown>[], props: string[]) => {
  // Add a blank line before any table
  const table = new Table();
  if (data && data.length === 0) {
    logger.warn('No data found for this query and resource.\n');
    for (const prop of props) {
      table.cell(prop, 'N/A');
    }
    table.newRow();
    return table.toString();
  } else if (!data) {
    logger.warn('Expecting an array of data, but got null.\n');
  }
  logger.log('');
  for (const item of data) {
    for (const prop of props) {
      const value = item[prop];
      if (value instanceof StreamID) {
        table.cell(prop, value.toString());
      } else if (prop === 'streamId') {
        table.cell(prop, chalk.green(value));
      } else if (prop === 'output' || prop === 'input') {
        table.cell(prop, inlineFormatIO(value));
      } else if (prop === 'status') {
        const status = value as WorkflowRun['status'] | Step['status'];
        const colorFunc = STATUS_COLORS[status];
        table.cell(prop, colorFunc(status));
      } else if (prop === 'eventData') {
        table.cell(prop, truncateString(JSON.stringify(value)));
      } else if (value instanceof Date) {
        table.cell(`${prop}`, formatTableTimestamp(value));
      } else {
        table.cell(prop, value);
      }
    }
    table.newRow();
  }
  return table.toString();
};

const showJson = (data: unknown) => {
  const json = JSON.stringify(data, null, 2);
  process.stdout.write(`${json}\n`);
};

const getCursorHint = ({
  hasMore,
  cursor,
}: {
  hasMore: boolean;
  cursor: string | null;
}) => {
  if (hasMore && cursor) {
    return `More results available. Append\n--cursor ${cursor}\nto fetch the next page.`;
  }
};

/**
 * In tables, we want to show a shorter timestamp, YYYY-MM-DD HH:MM:SS
 */
const formatTableTimestamp = (value: Date) => {
  const relativeValue = formatDistance(value, new Date());
  return `${relativeValue} ago`;
};

/**
 * This is an extra reviver for devalue that takes any streams that would be converted,
 * into actual streams, and instead formats them as string links for printing in CLI output.
 *
 * This is mainly because we don't want to open any streams that we aren't going to read from,
 * and so we can get the string ID/name, which the serializer stream doesn't provide.
 */
const streamPrintRevivers: Record<string, (value: any) => any> = {
  ReadableStream: (value: any) => {
    if ('name' in value) {
      return new StreamID(value.name);
    }
    return new StreamID(null);
  },
  WritableStream: (value: any) => {
    if ('name' in value) {
      return new StreamID(value.name);
    }
    return new StreamID(null);
  },
  TransformStream: (value: any) => {
    if ('name' in value) {
      return new StreamID(value.name);
    }
    return new StreamID(null);
  },
};

const hydrateWorkflowRunIO = (run: WorkflowRun): WorkflowRun => {
  return {
    ...run,
    input: run.input
      ? hydrateWorkflowArguments(run.input, globalThis, streamPrintRevivers)
      : run.input,
    output: run.output
      ? hydrateWorkflowReturnValue(
          run.output,
          [],
          globalThis,
          streamPrintRevivers
        )
      : run.output,
  };
};

const hydrateStepIO = (step: Step): Step => {
  return {
    ...step,
    input: step.input
      ? hydrateStepArguments(step.input, [], globalThis, streamPrintRevivers)
      : step.input,
    output: step.output
      ? hydrateStepReturnValue(step.output, globalThis, streamPrintRevivers)
      : step.output,
  };
};

const truncateString = (str: string, maxLength: number = 20) => {
  return str && str.length > maxLength
    ? `${str.substring(0, maxLength)}...`
    : str;
};

/**
 * Takes hydrated step/workflow input/output and serializes it for inline display.
 */
const inlineFormatIO = <T>(io: T): string => {
  const type = typeof io;
  let value = '';
  if (io === undefined) {
    value = '<empty>';
  } else if (io === null) {
    value = '<null>';
  } else if (io && Array.isArray(io)) {
    if (io.length === 0) {
      value = '<empty>';
    } else {
      value = io.map((item) => inlineFormatIO(item)).join(',');
    }
  } else if (type === 'object') {
    if (io instanceof StreamID) {
      value = io.toString();
    } else if (io instanceof Date) {
      value = `${formatTableTimestamp(io)}`;
    } else {
      value = truncateString(JSON.stringify(io));
    }
  } else if (['string', 'number', 'boolean'].includes(type)) {
    if (type === 'string' && (io as string).includes('strm_')) {
      value = io as string;
    }
    value = truncateString(String(io));
  } else {
    value = `<${type}>`;
  }
  return value;
};

export const listRuns = async (world: World, opts: InspectCLIOptions = {}) => {
  const runs = await world.runs.list({
    pagination: { cursor: opts.cursor, limit: DEFAULT_PAGINATION_LIMIT },
  });
  if (opts.stepId || opts.runId) {
    logger.warn(
      'Filtering by step-id or run-id is not supported in list calls, ignoring filter.'
    );
  }
  if (opts.json) {
    showJson(runs);
    return;
  }
  const runsWithHydratedIO = runs.data.map((run) => hydrateWorkflowRunIO(run));
  logger.showBox(
    'white',
    'INFO',
    'To view the input/output of a run, use `wf i run <run-id>`',
    'To view the content of any stream, use `wf i stream <stream-id>`',
    getCursorHint(runs)
  );
  logger.log(showTable(runsWithHydratedIO, WORKFLOW_RUN_LISTED_PROPS));
};

export const getRecentRun = async (world: World) => {
  logger.warn(`No runId provided, fetching data for latest run instead.`);
  const runs = await world.runs.list({ pagination: { limit: 1 } });
  return runs.data[0];
};

export const showRun = async (
  world: World,
  runId: string,
  opts: InspectCLIOptions = {}
) => {
  const run = await world.runs.get(runId);
  const runWithHydratedIO = hydrateWorkflowRunIO(run);
  if (opts.json) {
    showJson(runWithHydratedIO);
    return;
  } else {
    logger.log(runWithHydratedIO);
  }
};

export const listSteps = async (
  world: World,
  opts: InspectCLIOptions = {
    runId: undefined,
  }
) => {
  if (opts.stepId) {
    logger.warn(
      'Filtering by step-id is not supported in list calls, ignoring filter.'
    );
  }

  const runId = opts.runId ? opts.runId : (await getRecentRun(world))?.runId;
  if (!runId) {
    logger.error('No run found.');
    return;
  }

  logger.debug(`Fetching steps for run ${runId}`);
  const stepChunks = await world.steps.list({
    runId,
    pagination: { cursor: opts.cursor, limit: DEFAULT_PAGINATION_LIMIT },
  });
  const steps = stepChunks.data;
  if (opts.json) {
    showJson(steps);
    return;
  }
  const stepsWithHydratedIO = steps.map((step) => hydrateStepIO(step));
  logger.log(showTable(stepsWithHydratedIO, STEP_LISTED_PROPS));
  logger.showBox(
    'white',
    'INFO',
    'To view the input/output of a step, use `wf i step <step-id>`',
    'To view the content of any stream, use `wf i stream <stream-id>`',
    getCursorHint(stepChunks)
  );
};

export const showStep = async (
  world: World,
  stepId: string,
  opts: InspectCLIOptions = {}
) => {
  if (opts.stepId) {
    logger.warn(
      'Filtering by step-id is not supported in get calls, ignoring filter.'
    );
  }
  const step = await world.steps.get(opts.runId, stepId);
  const stepWithHydratedIO = hydrateStepIO(step);
  if (opts.json) {
    showJson(stepWithHydratedIO);
    return;
  } else {
    logger.log(stepWithHydratedIO);
  }
};

export const showStream = async (
  _: World,
  streamId: string,
  opts: InspectCLIOptions = {}
) => {
  if (opts.runId || opts.stepId) {
    logger.warn(
      'Filtering by run-id or step-id is not supported in get calls, ignoring filter.'
    );
  }
  const stream = getWorkflowReadableStream(streamId);
  logger.info('Streaming to stdout, press CTRL+C to abort.');
  logger.info(
    'Use --json to output the stream as newline-delimited JSON without info logs.\n'
  );
  await streamToConsole(stream, streamId, opts);
};

/**
 * Listing streams only lists available stream IDs based on run/step passed,
 * and doesn't read any data from the streams.
 */
export const listStreams = async (
  world: World,
  opts: InspectCLIOptions = {}
) => {
  const steps: Step[] = [];
  const runs: WorkflowRun[] = [];
  if (opts.stepId) {
    const step = await world.steps.get(undefined, opts.stepId);
    steps.push(step);
  } else if (opts.runId) {
    const run = await world.runs.get(opts.runId);
    runs.push(run);
    const runsSteps = await world.steps.list({
      runId: opts.runId,
      pagination: { cursor: opts.cursor, limit: DEFAULT_PAGINATION_LIMIT },
    });
    runsSteps.data.forEach((step: Step) => steps.push(step));
    logger.info(getCursorHint(runsSteps));
  } else {
    logger.warn(
      'No run-id or step-id provided. Listing streams for latest run instead.',
      'Use --run=<run-id> or --step=<step-id> to filter streams by run or step.'
    );
    const run = await getRecentRun(world);
    if (!run) {
      logger.warn('No runs found.');
      return;
    }
    runs.push(run);
    const runsSteps = await world.steps.list({
      runId: runs[0].runId,
      pagination: { cursor: opts.cursor, limit: DEFAULT_PAGINATION_LIMIT },
    });
    runsSteps.data.forEach((step: Step) => steps.push(step));
    logger.info(getCursorHint(runsSteps));
  }

  const runIds = runs.map((item) => item.runId);
  const stepIds = steps.map((item) => item.stepId);
  logger.debug(`Found IO for runs/steps: ${runIds.concat(stepIds).join(', ')}`);

  // We need to hydrate IO for all the runs and steps to find stream IDs
  const runsWithHydratedIO = runs.map((run) => hydrateWorkflowRunIO(run));
  const stepsWithHydratedIO = steps.map((step) => hydrateStepIO(step));

  const matchingStreams = [
    ...runsWithHydratedIO,
    ...stepsWithHydratedIO,
  ].flatMap((item) =>
    findAllStreamIdsForObjectWithIO({
      input: item.input,
      output: item.output,
      runId: item.runId,
      stepId: 'stepId' in item ? item.stepId : undefined,
    })
  );

  if (opts.json) {
    showJson(matchingStreams);
    return;
  }
  logger.log(showTable(matchingStreams, ['runId', 'stepId', 'streamId']));
};

const findAllStreamIdsForObjectWithIO = (obj: {
  input: any;
  output: any;
  runId?: string;
  stepId?: string;
}) => {
  const matchingStreams: {
    runId?: string;
    stepId?: string;
    streamId: string;
  }[] = [];
  const inputStreams = getStreamIdsFromHydratedObject(obj.input);
  for (const streamId of inputStreams) {
    matchingStreams.push({
      runId: obj.runId,
      stepId: obj.stepId || '/',
      streamId,
    });
  }
  const outputStreams = getStreamIdsFromHydratedObject(obj.output);
  for (const streamId of outputStreams) {
    matchingStreams.push({
      runId: obj.runId,
      stepId: obj.stepId || '/',
      streamId,
    });
  }
  return matchingStreams;
};

const getStreamIdsFromHydratedObject = (io: any): string[] => {
  const streamIds: string[] = [];
  const traverse = (obj: any): void => {
    if (!obj || typeof obj !== 'object') return;
    if (obj instanceof StreamID) {
      streamIds.push(obj.toString());
    } else if (Array.isArray(obj)) {
      obj.forEach(traverse);
    } else {
      Object.values(obj).forEach(traverse);
    }
  };

  traverse(io);
  return streamIds;
};

export const listEvents = async (
  world: World,
  opts: InspectCLIOptions = {}
) => {
  if (opts.stepId) {
    const step = await world.steps.get(undefined, opts.stepId);
    const runId = step.runId;
    opts.runId = runId;
  }
  const runId = opts.runId ? opts.runId : (await getRecentRun(world))?.runId;
  if (!runId) {
    logger.error('No run found.');
    return;
  }
  logger.debug(`Fetching events for run ${runId}`);
  const events = await world.events.list({
    runId,
    pagination: { cursor: opts.cursor, limit: DEFAULT_PAGINATION_LIMIT },
  });
  if (opts.stepId) {
    events.data = events.data.filter(
      (event) => event.correlationId === opts.stepId
    );
  }
  if (opts.json) {
    showJson(events.data);
    return;
  }
  logger.log(showTable(events.data, EVENT_LISTED_PROPS));
};
