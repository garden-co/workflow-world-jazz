import { HookNotFoundError, WorkflowWorldError } from '@workflow/errors';
import {
  type Event,
  type Hook,
  isTerminalWorkflowRunStatus,
  type ResolveData,
  type Step,
  type Storage,
  StepSchema,
  getMaxEventsPerRun,
  eventIdToSlot,
  stripEventDataRefs,
  HookSchema,
  WorkflowRunSchema,
  type WorkflowRun,
} from '@workflow/world';
import { clone, type Engine } from './engine.js';

/** Upper bound on one wait inside `runs.waitForTerminalStatus`. */
const TERMINAL_POLL_MS = 1_000;

export function createStorage(engine: Engine): Storage {
  return {
    runs: createRunStorage(engine),
    steps: createStepStorage(engine),
    events: createEventStorage(engine),
    hooks: createHookStorage(engine),
  };
}

function filterRun(run: WorkflowRun, resolveData: ResolveData = 'all') {
  const parsed = WorkflowRunSchema.parse(clone(run));
  if (resolveData !== 'none') return parsed;
  const { input: _input, output: _output, ...rest } = parsed;
  return { ...rest, input: undefined, output: undefined };
}

function filterStep(step: Step, resolveData: ResolveData = 'all') {
  const parsed = StepSchema.parse(clone(step));
  if (resolveData !== 'none') return parsed;
  const { input: _input, output: _output, ...rest } = parsed;
  return { ...rest, input: undefined, output: undefined };
}

function filterHook(hook: Hook, resolveData: ResolveData = 'all') {
  const parsed = HookSchema.parse(clone(hook));
  if (resolveData !== 'none') return parsed;
  const { metadata: _metadata, ...rest } = parsed;
  return { ...rest, metadata: undefined };
}

/**
 * Pages over items already sorted ascending by `key`. The cursor is the key of
 * the last item on the previous page.
 */
function paginate<T>(
  items: T[],
  key: (item: T) => string,
  pagination: { limit?: number; cursor?: string; sortOrder?: 'asc' | 'desc' },
  defaults: { limit: number; sortOrder: 'asc' | 'desc' }
) {
  const sortOrder = pagination.sortOrder ?? defaults.sortOrder;
  const limit = pagination.limit ?? defaults.limit;
  let ordered = sortOrder === 'desc' ? [...items].reverse() : items;
  if (pagination.cursor) {
    const cursor = pagination.cursor;
    ordered = ordered.filter((item) =>
      sortOrder === 'desc' ? key(item) < cursor : key(item) > cursor
    );
  }
  const page = ordered.slice(0, limit);
  return {
    page,
    cursor: page.length > 0 ? key(page[page.length - 1]) : null,
    hasMore: ordered.length > limit,
  };
}

function createRunStorage(engine: Engine): Storage['runs'] {
  const get = (async (id: string, params?: { resolveData?: ResolveData }) => {
    const state = await engine.require(id);
    return filterRun(state.run!, params?.resolveData);
  }) as Storage['runs']['get'];

  return {
    get,

    waitForTerminalStatus: (async (id, params) => {
      const deadline = Date.now() + (params?.timeoutMs ?? 0);
      while (true) {
        const run = await get(id, params);
        const remaining = deadline - Date.now();
        if (
          isTerminalWorkflowRunStatus(run.status) ||
          remaining <= 0 ||
          params?.signal?.aborted
        ) {
          return run;
        }
        await engine.waitForTerminal(
          id,
          Math.min(remaining, TERMINAL_POLL_MS),
          params?.signal
        );
      }
    }) as NonNullable<Storage['runs']['waitForTerminalStatus']>,

    getMany: (async (ids, params) => {
      return Promise.all(
        ids.map(async (id) => {
          const state = await engine.load(id);
          return state?.run ? filterRun(state.run, params?.resolveData) : null;
        })
      );
    }) as NonNullable<Storage['runs']['getMany']>,

    list: (async (params) => {
      const statuses =
        params?.status === undefined
          ? undefined
          : Array.isArray(params.status)
            ? params.status
            : [params.status];
      const runIds = await engine.runIds();
      const matching: string[] = [];
      for (const runId of runIds) {
        if (!statuses && !params?.workflowName) {
          matching.push(runId);
          continue;
        }
        const summary = await engine.runSummary(runId);
        if (!summary) continue;
        if (
          params?.workflowName &&
          summary.workflowName !== params.workflowName
        ) {
          continue;
        }
        if (statuses && !statuses.includes(summary.status as never)) continue;
        matching.push(runId);
      }
      const { page, cursor, hasMore } = paginate(
        matching,
        (id) => id,
        params?.pagination ?? {},
        { limit: 20, sortOrder: 'desc' }
      );
      const data = [];
      for (const runId of page) {
        const state = await engine.load(runId);
        if (state?.run) data.push(filterRun(state.run, params?.resolveData));
      }
      return { data, cursor, hasMore };
    }) as Storage['runs']['list'],
  };
}

function createStepStorage(engine: Engine): Storage['steps'] {
  return {
    get: (async (runId, stepId, params) => {
      const state = await engine.require(runId);
      const step = state.steps.get(stepId);
      if (!step) {
        throw new WorkflowWorldError(`Step not found: ${stepId}`, {
          status: 404,
        });
      }
      return filterStep(step, params?.resolveData);
    }) as Storage['steps']['get'],

    list: (async (params) => {
      const state = await engine.require(params.runId);
      const steps = [...state.steps.values()].sort((a, b) =>
        a.stepId < b.stepId ? -1 : a.stepId > b.stepId ? 1 : 0
      );
      const { page, cursor, hasMore } = paginate(
        steps,
        (step) => step.stepId,
        params.pagination ?? {},
        { limit: 20, sortOrder: 'desc' }
      );
      return {
        data: page.map((step) => filterStep(step, params.resolveData)),
        cursor,
        hasMore,
      };
    }) as Storage['steps']['list'],
  };
}

function createEventStorage(engine: Engine): Storage['events'] {
  const pageEvents = (
    events: Event[],
    pagination: { limit?: number; cursor?: string; sortOrder?: 'asc' | 'desc' },
    resolveData: Parameters<typeof stripEventDataRefs>[1],
    defaultLimit: number
  ) => {
    const { page, cursor, hasMore } = paginate(
      events,
      (event) => event.eventId,
      pagination,
      { limit: defaultLimit, sortOrder: 'asc' }
    );
    return {
      data: page.map((event) => stripEventDataRefs(event, resolveData)),
      cursor,
      hasMore,
    };
  };

  return {
    create: ((runId: string | null, data: any, params: any) =>
      engine.create(runId, data, params)) as Storage['events']['create'],

    async get(runId, eventId, params) {
      const state = await engine.require(runId);
      const slot = eventIdToSlot(eventId);
      const event = slot === null ? undefined : state.events[slot - 1];
      if (!event) {
        throw new WorkflowWorldError(`Event not found: ${eventId}`, {
          status: 404,
        });
      }
      return stripEventDataRefs(event, params?.resolveData ?? 'all');
    },

    async list(params) {
      const state = await engine.require(params.runId);
      return pageEvents(
        state.events,
        params.pagination ?? {},
        params.resolveData ?? 'all',
        getMaxEventsPerRun()
      );
    },

    async listByCorrelationId(params) {
      const state = await engine.require(params.runId);
      return pageEvents(
        state.events.filter(
          (event) => event.correlationId === params.correlationId
        ),
        params.pagination ?? {},
        params.resolveData ?? 'all',
        100
      );
    },
  };
}

function createHookStorage(engine: Engine): Storage['hooks'] {
  const find = async (hookId: string) => {
    const runId = await engine.hookRunId(hookId);
    if (!runId) return undefined;
    return (await engine.load(runId))?.hooks.get(hookId);
  };

  return {
    async get(hookId, params) {
      const hook = await find(hookId);
      if (!hook) throw new HookNotFoundError(hookId);
      return filterHook(hook, params?.resolveData);
    },

    async getByToken(token, params) {
      const owner = await engine.tokenOwner(token);
      const hook = owner && (await find(owner.hookId));
      if (!hook) throw new HookNotFoundError(token);
      return filterHook(hook, params?.resolveData);
    },

    async list(params) {
      let hooks: Hook[];
      if (params.runId) {
        hooks = [...((await engine.load(params.runId))?.hooks.values() ?? [])];
      } else {
        hooks = [];
        for (const runId of await engine.hookRunIds()) {
          const state = await engine.load(runId);
          if (state) hooks.push(...state.hooks.values());
        }
      }
      hooks.sort((a, b) =>
        a.hookId < b.hookId ? -1 : a.hookId > b.hookId ? 1 : 0
      );
      const { page, cursor, hasMore } = paginate(
        hooks,
        (hook) => hook.hookId,
        params.pagination ?? {},
        { limit: 100, sortOrder: 'asc' }
      );
      return {
        data: page.map((hook) => filterHook(hook, params.resolveData)),
        cursor,
        hasMore,
      };
    },
  };
}
