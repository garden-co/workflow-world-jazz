import {
  EntityConflictError,
  HookNotFoundError,
  RunExpiredError,
  RunNotSupportedError,
  TooEarlyError,
  WorkflowRunNotFoundError,
  WorkflowWorldError,
} from '@workflow/errors';
import {
  ATTRIBUTE_MAX_PER_RUN,
  AttributeValidationError,
  applyAttributeChanges,
  type CreateEventParams,
  type Event,
  EventSchema,
  type EventResult,
  eventIdToSlot,
  type Hook,
  isChildEntityCreationEvent,
  isChildEntityCreationEventType,
  isHookEventRequiringExistence,
  isLegacySpecVersion,
  isTerminalRunEventType,
  isTerminalStepStatus,
  isTerminalWorkflowRunStatus,
  requiresNewerWorld,
  SPEC_VERSION_CURRENT,
  type Step,
  slotToEventId,
  stripEventDataRefs,
  validateAttributeChanges,
  validateUlidTimestamp,
  type Wait,
  type WorkflowRun,
} from '@workflow/world';
import { co, type Group, z } from 'jazz-tools';
import { monotonicFactory } from 'ulid';
import { decodeEntry, encodeEntry } from './codec.js';
import { JazzRun, type JazzWorldRoot } from './types.js';

/** How many runs' replayed state one process keeps in memory. */
const MAX_CACHED_RUNS = 500;

/** Events returned inline by an incremental (`sinceCursor`) write. */
const DELTA_PAGE_SIZE = 100;

type LoadedRun = co.loaded<typeof JazzRun, { events: true; streams: true }>;

// The event request union is wide and every branch narrows it by
// `eventType`, so its payload is read through this loose view.
type AnyEventData = Record<string, any>;
interface EventRequest {
  eventType: Event['eventType'];
  correlationId?: string;
  specVersion?: number;
  eventData?: AnyEventData;
}

/** An event about to be appended, before it has a slot. */
interface Draft {
  eventType: Event['eventType'];
  correlationId?: string;
  eventData?: AnyEventData;
  specVersion: number;
}

/**
 * One run, replayed from its event log. Every entity the World reports for
 * the run is a projection of `events`, rebuilt the same way on every load.
 */
export interface RunState {
  runId: string;
  doc: LoadedRun;
  events: Event[];
  run?: WorkflowRun;
  steps: Map<string, Step>;
  hooks: Map<string, Hook>;
  waits: Map<string, Wait>;
  /** `${eventType}:${correlationId}` of every creation event in the log. */
  created: Set<string>;
}

export interface EngineDeps {
  /** The World's root, with its runs and hook indexes loaded. */
  root: () => Promise<JazzWorldRoot>;
  /** Resolves once every local change has reached the sync server. */
  sync: () => Promise<void>;
}

/**
 * The event log and everything derived from it.
 *
 * Jazz is a CRDT store: it has no conditional write or transaction that two
 * processes can race on and have exactly one win. Event slots are therefore
 * allocated in process. Every write to a run holds that run's lock across
 * validation and append, and the append itself is synchronous, so writers in
 * one process never race for a slot and a reader's log is always a prefix of
 * the run's. Across processes nothing serializes them, which is why this World
 * supports one process per Jazz worker account (see the README). Each stored
 * event records its own id, so a log that two processes extended concurrently
 * is detected on load and refused rather than replayed out of order.
 */
export class Engine {
  private readonly states = new Map<string, Promise<RunState | null>>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly terminalListeners = new Map<string, Set<() => void>>();
  private readonly ulid = monotonicFactory();

  constructor(private readonly deps: EngineDeps) {}

  async owner(): Promise<Group> {
    return (await this.deps.root()).$jazz.owner;
  }

  /** The run's replayed state, or null when the run does not exist. */
  async load(runId: string): Promise<RunState | null> {
    let pending = this.states.get(runId);
    if (pending) {
      // Re-insert to keep the map in least-recently-used order.
      this.states.delete(runId);
      this.states.set(runId, pending);
      return pending;
    }
    pending = this.replay(runId);
    this.states.set(runId, pending);
    pending.then(
      (state) => {
        // Missing runs are not cached: one may be created by the next write.
        if (!state && this.states.get(runId) === pending) {
          this.states.delete(runId);
        }
      },
      () => {
        if (this.states.get(runId) === pending) this.states.delete(runId);
      }
    );
    this.evict();
    return pending;
  }

  async require(runId: string): Promise<RunState> {
    const state = await this.load(runId);
    if (!state?.run) throw new WorkflowRunNotFoundError(runId);
    return state;
  }

  /** Every run id, oldest first (run ids are ULIDs). */
  async runIds(): Promise<string[]> {
    const root = await this.deps.root();
    return Object.keys(root.runs).sort();
  }

  async runSummary(runId: string) {
    const root = await this.deps.root();
    const id = root.runs.$jazz.refs[runId]?.id;
    if (!id) return undefined;
    const doc = await JazzRun.load(id);
    return doc.$isLoaded ? doc : undefined;
  }

  /** Runs that hold at least one hook that can still receive. */
  async hookRunIds(): Promise<string[]> {
    const { hookRuns } = await this.deps.root();
    return [...new Set(Object.values(hookRuns) as string[])].sort();
  }

  async hookRunId(hookId: string): Promise<string | undefined> {
    return (await this.deps.root()).hookRuns[hookId];
  }

  async tokenOwner(
    token: string
  ): Promise<{ runId: string; hookId: string } | undefined> {
    const value = (await this.deps.root()).hookTokens[token];
    if (!value) return undefined;
    const [runId, hookId] = value.split(' ');
    return { runId, hookId };
  }

  /** Resolves the next time the run reaches a terminal status, or on timeout. */
  waitForTerminal(runId: string, timeoutMs: number, signal?: AbortSignal) {
    return new Promise<void>((resolve) => {
      let listeners = this.terminalListeners.get(runId);
      if (!listeners) {
        listeners = new Set();
        this.terminalListeners.set(runId, listeners);
      }
      const done = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', done);
        listeners.delete(done);
        if (listeners.size === 0) this.terminalListeners.delete(runId);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      signal?.addEventListener('abort', done);
      listeners.add(done);
    });
  }

  /** Runs `fn` with exclusive access to the run's log in this process. */
  async withLock<T>(runId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(runId) ?? Promise.resolve();
    const current = previous.then(fn, fn);
    const settled = current.then(
      () => undefined,
      () => undefined
    );
    this.locks.set(runId, settled);
    settled.then(() => {
      if (this.locks.get(runId) === settled) this.locks.delete(runId);
    });
    return current;
  }

  async create(
    runId: string | null,
    data: EventRequest,
    params?: CreateEventParams
  ): Promise<EventResult> {
    let effectiveRunId: string;
    if (data.eventType === 'run_created') {
      if (runId) {
        const invalid = validateUlidTimestamp(runId, 'wrun_');
        if (invalid) throw new WorkflowWorldError(invalid, { status: 400 });
        effectiveRunId = runId;
      } else {
        effectiveRunId = `wrun_${this.ulid()}`;
      }
    } else if (!runId) {
      throw new WorkflowWorldError(
        'runId is required for non-run_created events',
        { status: 400 }
      );
    } else {
      effectiveRunId = runId;
    }
    return this.withLock(effectiveRunId, () =>
      this.createLocked(effectiveRunId, data, params)
    );
  }

  private async createLocked(
    runId: string,
    data: EventRequest,
    params?: CreateEventParams
  ): Promise<EventResult> {
    const specVersion = data.specVersion ?? SPEC_VERSION_CURRENT;
    const eventData = data.eventData;
    const correlationId = data.correlationId;
    const resolveData = params?.resolveData ?? 'all';
    const root = await this.deps.root();

    if (data.eventType === 'run_created') {
      if (root.runs.$jazz.has(runId)) {
        throw new EntityConflictError(`Workflow run "${runId}" already exists`);
      }
      assertRunInput(eventData);
      const state = this.newRun(root, runId, eventData?.workflowName);
      const event = this.append(state, root, {
        eventType: 'run_created',
        correlationId,
        eventData: runCreatedData(eventData),
        specVersion,
      });
      await this.deps.sync();
      return this.result(state, event, params, { run: state.run });
    }

    let state = await this.load(runId);

    // Resilient start: the queue can bootstrap a run whose run_created was
    // lost, from the run input it carries on run_started.
    if (
      !state &&
      data.eventType === 'run_started' &&
      eventData?.deploymentId &&
      eventData.workflowName &&
      eventData.input !== undefined
    ) {
      assertRunInput(eventData);
      state = this.newRun(root, runId, eventData.workflowName);
      this.append(state, root, {
        eventType: 'run_created',
        eventData: runCreatedData(eventData),
        specVersion,
      });
    }

    if (!state?.run) throw new WorkflowRunNotFoundError(runId);
    const run = state.run;

    if (requiresNewerWorld(run.specVersion)) {
      throw new RunNotSupportedError(run.specVersion!, SPEC_VERSION_CURRENT);
    }
    if (isLegacySpecVersion(run.specVersion)) {
      // This store only ever holds runs it created at a slot-numbered version.
      throw new RunNotSupportedError(run.specVersion ?? 1, SPEC_VERSION_CURRENT);
    }

    const lazyStepStart =
      data.eventType === 'step_started' &&
      isChildEntityCreationEvent(data as never);

    if (isTerminalWorkflowRunStatus(run.status)) {
      if (data.eventType === 'run_cancelled' && run.status === 'cancelled') {
        const event = this.append(state, root, {
          eventType: 'run_cancelled',
          correlationId,
          eventData,
          specVersion,
        });
        await this.deps.sync();
        return this.result(state, event, params, { run: state.run });
      }
      if (data.eventType === 'run_started') {
        throw new RunExpiredError(
          `Workflow run "${runId}" is already in terminal state "${run.status}"`
        );
      }
      if (isTerminalRunEventType(data.eventType)) {
        throw new EntityConflictError(
          `Cannot transition run from terminal state "${run.status}"`
        );
      }
      if (lazyStepStart || isChildEntityCreationEventType(data.eventType)) {
        throw new EntityConflictError(
          `Cannot create new entities on run in terminal state "${run.status}"`
        );
      }
      if (data.eventType === 'attr_set') {
        throw new EntityConflictError(
          `Cannot set attributes on run in terminal state "${run.status}"`
        );
      }
      if (data.eventType === 'hook_received') {
        throw new RunExpiredError(
          `Workflow run "${runId}" is already in terminal state "${run.status}"`
        );
      }
    }

    if (isHookEventRequiringExistence(data.eventType) && correlationId) {
      if (!state.hooks.has(correlationId)) {
        throw new HookNotFoundError(correlationId);
      }
    }

    const drafts: Draft[] = [];
    const own = (overrides: Partial<Draft> = {}): Draft => ({
      eventType: data.eventType,
      correlationId,
      eventData,
      specVersion,
      ...overrides,
    });
    let stepCreated = false;

    switch (data.eventType) {
      case 'run_started': {
        // Concurrent deliveries replay the same run deterministically, so a
        // run that is already running is returned as-is, without a second
        // run_started in its log.
        if (run.status === 'running') return { run: { ...run } as never };
        drafts.push(own({ eventData: undefined }));
        break;
      }
      case 'attr_set': {
        if (
          correlationId &&
          eventData?.writer?.type === 'workflow' &&
          state.created.has(createdKey('attr_set', correlationId))
        ) {
          throw new EntityConflictError(
            `attr_set for correlationId "${correlationId}" already exists in run "${runId}"`
          );
        }
        const changes = eventData?.changes ?? [];
        validateAttributeChanges(changes, {
          existingKeys: Object.keys(run.attributes ?? {}),
          allowReservedAttributes: eventData?.allowReservedAttributes === true,
        });
        const merged = applyAttributeChanges(run.attributes, changes);
        if (Object.keys(merged).length > ATTRIBUTE_MAX_PER_RUN) {
          throw new AttributeValidationError(
            `Run attribute count would exceed limit ${ATTRIBUTE_MAX_PER_RUN}`
          );
        }
        drafts.push(own());
        break;
      }
      case 'step_created': {
        if (state.steps.has(correlationId!)) {
          throw new EntityConflictError(
            `step_created for correlationId "${correlationId}" already exists in run "${runId}"`
          );
        }
        drafts.push(own());
        break;
      }
      case 'step_started': {
        const step = state.steps.get(correlationId!);
        if (lazyStepStart) {
          // A step_started carrying the step's name and input creates the
          // step. Only the caller that creates it may run its body, so a step
          // that already exists means another delivery won.
          if (step) {
            throw new EntityConflictError(
              `Step "${correlationId}" already created`
            );
          }
          const { input, ...rest } = eventData ?? {};
          drafts.push(
            own({
              eventType: 'step_created',
              eventData: { stepName: eventData?.stepName, input },
            }),
            own({ eventData: rest })
          );
          stepCreated = true;
          break;
        }
        if (!step) {
          throw new WorkflowWorldError(`Step "${correlationId}" not found`, {
            status: 404,
          });
        }
        if (isTerminalStepStatus(step.status)) {
          throw new EntityConflictError(
            `Cannot modify step in terminal state "${step.status}"`
          );
        }
        // A start is never accepted on a finished run, even when the step
        // still reads `running`: that is a redelivery of a start an earlier
        // delivery claimed, and running the body again would produce an
        // outcome nothing reads.
        if (isTerminalWorkflowRunStatus(run.status)) {
          throw new RunExpiredError(
            `Cannot start step on run in terminal state "${run.status}"`
          );
        }
        if (step.retryAfter && step.retryAfter.getTime() > Date.now()) {
          throw new TooEarlyError(
            `Cannot start step "${correlationId}": retryAfter timestamp has not been reached yet`,
            {
              retryAfter: Math.ceil(
                (step.retryAfter.getTime() - Date.now()) / 1000
              ),
            }
          );
        }
        drafts.push(own());
        break;
      }
      case 'step_completed':
      case 'step_failed':
      case 'step_retrying': {
        // Accepted on a terminal run, so a step already in flight can still
        // record its outcome.
        const step = state.steps.get(correlationId!);
        if (!step) {
          throw new WorkflowWorldError(`Step "${correlationId}" not found`, {
            status: 404,
          });
        }
        if (isTerminalStepStatus(step.status)) {
          throw new EntityConflictError(
            `Cannot modify step in terminal state "${step.status}"`
          );
        }
        drafts.push(own());
        break;
      }
      case 'hook_created': {
        if (eventData?.tokenRetentionUntil !== undefined) {
          throw new WorkflowWorldError(
            'Hook token retention is not supported by the Jazz World',
            { status: 400 }
          );
        }
        if (state.created.has(createdKey('hook_created', correlationId!))) {
          throw new EntityConflictError(
            `Hook "${correlationId}" already created`
          );
        }
        const owner = root.hookTokens[eventData?.token as string];
        if (owner) {
          // Another live hook holds the token. Recorded in this run's log
          // rather than thrown, so the workflow fails when it awaits the hook.
          // `experimental_force` is not supported, so a forced creation
          // conflicts the same way (the runtime refuses it before it gets
          // here, since `hookForceClaim` is not advertised).
          drafts.push(
            own({
              eventType: 'hook_conflict',
              eventData: {
                token: eventData?.token,
                conflictingRunId: owner.split(' ')[0],
              },
            })
          );
          break;
        }
        drafts.push(own());
        break;
      }
      case 'hook_disposed':
      case 'hook_received': {
        drafts.push(own());
        break;
      }
      case 'wait_created': {
        if (state.waits.has(correlationId!)) {
          throw new EntityConflictError(
            `Wait "${correlationId}" already exists`
          );
        }
        drafts.push(own());
        break;
      }
      case 'wait_completed': {
        const wait = state.waits.get(correlationId!);
        if (!wait) {
          throw new WorkflowWorldError(`Wait "${correlationId}" not found`, {
            status: 404,
          });
        }
        if (wait.status === 'completed') {
          throw new EntityConflictError(
            `Wait "${correlationId}" already completed`
          );
        }
        drafts.push(own());
        break;
      }
      case 'noop': {
        // Written only by a World's own read path to seal an abandoned slot.
        // This World allocates at the commit and never leaves one.
        throw new WorkflowWorldError('noop events cannot be created', {
          status: 400,
        });
      }
      default: {
        drafts.push(own());
      }
    }

    let event: Event | undefined;
    for (const draft of drafts) event = this.append(state, root, draft);
    await this.deps.sync();

    const entities: Partial<EventResult> = {};
    if (data.eventType.startsWith('run_') || data.eventType === 'attr_set') {
      entities.run = state.run;
    }
    if (correlationId && data.eventType.startsWith('step_')) {
      entities.step = state.steps.get(correlationId);
    }
    if (correlationId && data.eventType === 'hook_created') {
      entities.hook = state.hooks.get(correlationId);
    }
    if (correlationId && data.eventType.startsWith('wait_')) {
      entities.wait = state.waits.get(correlationId);
    }
    if (stepCreated) entities.stepCreated = true;
    return this.result(state, event!, params, entities, resolveData);
  }

  private newRun(
    root: JazzWorldRoot,
    runId: string,
    workflowName: string
  ): RunState {
    const owner = root.$jazz.owner;
    const doc = JazzRun.create(
      {
        runId,
        workflowName,
        status: 'pending',
        createdAt: new Date(),
        events: co.list(z.string()).create([], owner),
        streams: co.record(z.string(), co.fileStream()).create({}, owner),
      },
      owner
    ) as LoadedRun;
    root.runs.$jazz.set(runId, doc);
    const state = emptyState(runId, doc);
    const pending = Promise.resolve(state);
    this.states.set(runId, pending);
    this.evict();
    return state;
  }

  /**
   * Gives the draft the next slot, persists it, and folds it into the run's
   * state. Synchronous from slot choice to push, so no other writer in this
   * process can take the same slot.
   */
  private append(state: RunState, root: JazzWorldRoot, draft: Draft): Event {
    const owner = root.$jazz.owner;
    const slot = state.events.length + 1;
    const stored = {
      eventId: slotToEventId(slot),
      eventType: draft.eventType,
      correlationId: draft.correlationId,
      eventData: draft.eventData,
      specVersion: draft.specVersion,
      createdAt: new Date(),
    };
    const event = parseEvent(state.runId, stored);
    state.doc.events.$jazz.push(encodeEntry(stored, owner));

    const hooksBefore = [...state.hooks.values()];
    applyEvent(state, event);

    // Indexes outside the run's own log.
    if (event.eventType === 'hook_created') {
      const hook = state.hooks.get(event.correlationId!)!;
      root.hookTokens.$jazz.set(hook.token, `${state.runId} ${hook.hookId}`);
      root.hookRuns.$jazz.set(hook.hookId, state.runId);
    }
    if (event.eventType === 'hook_disposed') {
      const hook = hooksBefore.find((h) => h.hookId === event.correlationId);
      if (hook) releaseHook(root, hook);
    }
    if (isTerminalRunEventType(event.eventType)) {
      for (const hook of hooksBefore) releaseHook(root, hook);
    }
    if (state.run && state.doc.status !== state.run.status) {
      state.doc.$jazz.set('status', state.run.status);
      if (isTerminalWorkflowRunStatus(state.run.status)) {
        for (const listener of this.terminalListeners.get(state.runId) ?? []) {
          listener();
        }
      }
    }
    return event;
  }

  private result(
    state: RunState,
    event: Event,
    params: CreateEventParams | undefined,
    entities: Partial<EventResult>,
    resolveData = params?.resolveData ?? 'all'
  ): EventResult {
    const result = {
      ...clone(entities),
      event: stripEventDataRefs(event, resolveData),
    } as EventResult;
    const slot = eventIdToSlot(event.eventId)!;
    const page = (from: number, to: number) =>
      state.events
        .slice(from, to)
        .map((e) => stripEventDataRefs(e, resolveData));

    // Inline delta: what `events.list({ cursor: sinceCursor })` would return
    // now, so the caller can skip that read.
    if (typeof params?.sinceCursor === 'string') {
      const from = eventIdToSlot(params.sinceCursor) ?? 0;
      const events = page(from, from + DELTA_PAGE_SIZE);
      return {
        ...result,
        events,
        cursor: events.at(-1)?.eventId ?? params.sinceCursor,
        hasMore: state.events.length > from + DELTA_PAGE_SIZE,
      };
    }
    // run_started preloads the whole log for the replay that follows it.
    if (event.eventType === 'run_started' && !params?.skipPreload) {
      const events = page(0, state.events.length);
      return {
        ...result,
        events,
        cursor: events.at(-1)?.eventId ?? null,
        hasMore: false,
      };
    }
    // Bump and report: the writer expected slot `eventCount + 1`. When it
    // landed higher, hand back the events it skipped over. Every slot below
    // this one is already committed, so the report is complete.
    if (
      params?.eventCount !== undefined &&
      params.eventCount >= 0 &&
      slot > params.eventCount + 1
    ) {
      return {
        ...result,
        events: page(params.eventCount, slot - 1),
        cursor: null,
        hasMore: false,
      };
    }
    return result;
  }

  private async replay(runId: string): Promise<RunState | null> {
    const root = await this.deps.root();
    const id = root.runs.$jazz.refs[runId]?.id;
    if (!id) return null;
    const doc = await JazzRun.load(id, {
      resolve: { events: true, streams: true },
    });
    if (!doc.$isLoaded) {
      throw new WorkflowWorldError(`Run ${runId} could not be loaded`);
    }
    const state = emptyState(runId, doc as LoadedRun);
    const entries = [...doc.events];
    const decoded = await Promise.all(
      entries.map((entry) => decodeEntry<Record<string, unknown>>(entry))
    );
    decoded.forEach((stored, index) => {
      const expected = slotToEventId(index + 1);
      if (stored.eventId !== expected) {
        // Two processes appended to this run concurrently and Jazz merged
        // both writes into one list. Replaying it would be replaying a log
        // whose positions moved after a reader saw them.
        throw new WorkflowWorldError(
          `Event log of run ${runId} holds ${String(stored.eventId)} at slot ${index + 1}; ` +
            'it was written by more than one process at once, which this World does not support.',
          { status: 500 }
        );
      }
      applyEvent(state, parseEvent(runId, stored));
    });
    return state;
  }

  private evict() {
    if (this.states.size <= MAX_CACHED_RUNS) return;
    for (const runId of this.states.keys()) {
      if (this.states.size <= MAX_CACHED_RUNS) break;
      if (this.locks.has(runId)) continue;
      this.states.delete(runId);
    }
  }
}

function emptyState(runId: string, doc: LoadedRun): RunState {
  return {
    runId,
    doc,
    events: [],
    steps: new Map(),
    hooks: new Map(),
    waits: new Map(),
    created: new Set(),
  };
}

function createdKey(eventType: string, correlationId: string) {
  return `${eventType}:${correlationId}`;
}

function releaseHook(root: JazzWorldRoot, hook: Hook) {
  if (root.hookTokens[hook.token] === `${hook.runId} ${hook.hookId}`) {
    root.hookTokens.$jazz.delete(hook.token);
  }
  root.hookRuns.$jazz.delete(hook.hookId);
}

function assertRunInput(eventData: AnyEventData | undefined) {
  if (eventData?.dynamicWorkflowCode !== undefined) {
    throw new WorkflowWorldError(
      'Dynamic workflows are not supported by the Jazz World',
      { status: 400 }
    );
  }
  validateAttributeChanges(
    Object.entries(eventData?.attributes ?? {}).map(([key, value]) => ({
      key,
      value: value as string,
    })),
    { allowReservedAttributes: eventData?.allowReservedAttributes === true }
  );
}

function runCreatedData(eventData: AnyEventData | undefined): AnyEventData {
  return {
    deploymentId: eventData?.deploymentId,
    workflowName: eventData?.workflowName,
    input: eventData?.input,
    executionContext: eventData?.executionContext,
    attributes: eventData?.attributes,
    allowReservedAttributes: eventData?.allowReservedAttributes,
    encryptionPublicKey: eventData?.encryptionPublicKey,
  };
}

function parseEvent(runId: string, stored: Record<string, unknown>): Event {
  return EventSchema.parse(compact({ ...stored, runId })) as Event;
}

/** Folds one committed event into the run's state. Used by writes and loads. */
function applyEvent(state: RunState, event: Event) {
  state.events.push(event);
  const at = event.createdAt;
  const id = event.correlationId;
  const data = ((event as { eventData?: AnyEventData }).eventData ??
    {}) as AnyEventData;
  if (
    id &&
    (isChildEntityCreationEventType(event.eventType) ||
      event.eventType === 'attr_set')
  ) {
    state.created.add(createdKey(event.eventType, id));
  }
  const run = state.run as (WorkflowRun & Record<string, unknown>) | undefined;
  const step = id ? (state.steps.get(id) as Step | undefined) : undefined;

  switch (event.eventType) {
    case 'run_created':
      state.run = compact({
        runId: state.runId,
        status: 'pending',
        deploymentId: data.deploymentId,
        workflowName: data.workflowName,
        specVersion: event.specVersion,
        executionContext: data.executionContext,
        input: data.input,
        attributes: { ...(data.attributes ?? {}) },
        encryptionPublicKey: data.encryptionPublicKey,
        createdAt: at,
        updatedAt: at,
      }) as WorkflowRun;
      break;
    case 'run_started':
      if (!run) break;
      run.status = 'running';
      run.startedAt ??= at;
      run.updatedAt = at;
      break;
    case 'run_completed':
    case 'run_failed':
    case 'run_cancelled':
      if (!run || isTerminalWorkflowRunStatus(run.status)) break;
      if (event.eventType === 'run_completed') {
        run.status = 'completed';
        run.output = data.output;
      } else if (event.eventType === 'run_failed') {
        run.status = 'failed';
        run.error = data.error;
        if (data.errorCode !== undefined) run.errorCode = data.errorCode;
      } else {
        run.status = 'cancelled';
      }
      run.completedAt = at;
      run.updatedAt = at;
      // A finished run's hooks can no longer receive and its waits no
      // longer matter.
      state.hooks.clear();
      state.waits.clear();
      break;
    case 'attr_set':
      if (!run) break;
      run.attributes = applyAttributeChanges(run.attributes, data.changes ?? []);
      run.updatedAt = at;
      break;
    case 'step_created':
      state.steps.set(
        id!,
        compact({
          runId: state.runId,
          stepId: id!,
          stepName: data.stepName,
          status: 'pending',
          input: data.input,
          attempt: 0,
          createdAt: at,
          updatedAt: at,
          specVersion: event.specVersion,
        }) as Step
      );
      break;
    case 'step_started':
      if (!step) break;
      step.status = 'running';
      step.attempt += 1;
      step.startedAt ??= at;
      step.retryAfter = undefined;
      step.updatedAt = at;
      break;
    case 'step_completed':
      if (!step) break;
      step.status = 'completed';
      step.output = data.result;
      step.completedAt = at;
      step.updatedAt = at;
      break;
    case 'step_failed':
      if (!step) break;
      step.status = 'failed';
      step.error = data.error;
      step.completedAt = at;
      step.updatedAt = at;
      break;
    case 'step_retrying':
      if (!step) break;
      step.status = 'pending';
      step.error = data.error;
      step.retryAfter = data.retryAfter;
      step.updatedAt = at;
      break;
    case 'hook_created':
      state.hooks.set(
        id!,
        compact({
          runId: state.runId,
          hookId: id!,
          token: data.token,
          ownerId: 'jazz-owner',
          projectId: 'jazz-project',
          environment: 'jazz',
          metadata: data.metadata,
          createdAt: at,
          specVersion: event.specVersion,
          isWebhook: data.isWebhook,
          isSystem: data.isSystem,
        }) as Hook
      );
      break;
    case 'hook_disposed':
      state.hooks.delete(id!);
      break;
    case 'wait_created':
      state.waits.set(
        id!,
        compact({
          waitId: `${state.runId}-${id}`,
          runId: state.runId,
          status: 'waiting',
          resumeAt: data.resumeAt,
          createdAt: at,
          updatedAt: at,
          specVersion: event.specVersion,
        }) as Wait
      );
      break;
    case 'wait_completed': {
      const wait = state.waits.get(id!);
      if (!wait) break;
      wait.status = 'completed';
      wait.completedAt = at;
      wait.updatedAt = at;
      break;
    }
  }
}

/** Drops `undefined` fields, which schemas and CBOR both treat as present. */
export function compact<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) out[key] = entry;
  }
  return out as T;
}

/** Entities leave the World as copies, so callers cannot edit the cache. */
export function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value instanceof Date || value instanceof Uint8Array) return value;
  if (value instanceof Map) return value;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) out[key] = clone(entry);
    return out as T;
  }
  return value;
}
