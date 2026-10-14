import { RunExpiredError, WorkflowRunNotFoundError } from '@workflow/errors';
import {
  eventIdToSlot,
  FIRST_EVENT_SLOT,
  mintedSpecVersion,
  SPEC_VERSION_CURRENT,
  slotToEventId,
  type World,
} from '@workflow/world';
import { createJazzTestAccount } from 'jazz-tools/testing';
import { ulid } from 'ulid';
import { beforeAll, describe, expect, it } from 'vitest';
import { JazzStorageAccount } from './types.js';
import { createWorldForAccount } from './world.js';

let world: World;

// One account for the file: every test works on its own runs.
beforeAll(async () => {
  world = createWorldForAccount(
    createJazzTestAccount({
      isCurrentActiveAccount: true,
      AccountSchema: JazzStorageAccount,
    }).then((worker) => ({ worker })),
    { webhookEndpoint: 'http://localhost:3000', webhookRegistryId: 'co_zTest' }
  );
});

const newRunId = () => `wrun_${ulid()}`;
const input = new Uint8Array([1, 2, 3]);

async function createRun(runId = newRunId(), workflowName = 'wf') {
  await world.events.create(runId, {
    eventType: 'run_created',
    specVersion: SPEC_VERSION_CURRENT,
    eventData: { deploymentId: 'dpl_test', workflowName, input },
  });
  return runId;
}

async function startRun(runId: string) {
  return world.events.create(runId, {
    eventType: 'run_started',
    specVersion: SPEC_VERSION_CURRENT,
  });
}

const stepCreated = (stepId: string) =>
  ({
    eventType: 'step_created',
    correlationId: stepId,
    specVersion: SPEC_VERSION_CURRENT,
    eventData: { stepName: 'step', input },
  }) as const;

async function eventIds(runId: string) {
  const { data } = await world.events.list({ runId });
  return data.map((event) => event.eventId);
}

describe('spec version', () => {
  it('declares the minted spec version', () => {
    expect(world.specVersion).toBe(mintedSpecVersion());
  });
});

describe('event ids', () => {
  it('numbers a run densely from the first slot', async () => {
    const runId = await createRun();
    await startRun(runId);
    await world.events.create(runId, stepCreated(`step_${ulid()}`));
    const ids = await eventIds(runId);
    expect(ids.map(eventIdToSlot)).toEqual(
      ids.map((_, i) => FIRST_EVENT_SLOT + i)
    );
  });

  it('keeps the log dense under concurrent writers', async () => {
    const runId = await createRun();
    await startRun(runId);
    const steps = Array.from({ length: 25 }, () => `step_${ulid()}`);
    await Promise.all(
      steps.map((stepId) =>
        world.events.create(runId, stepCreated(stepId), { eventCount: 2 })
      )
    );
    const ids = await eventIds(runId);
    expect(ids).toHaveLength(2 + steps.length);
    expect(ids).toEqual(ids.map((_, i) => slotToEventId(i + 1)));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('bumps a stale write and reports the slots it skipped', async () => {
    const runId = await createRun();
    await startRun(runId);
    const first = `step_${ulid()}`;
    await world.events.create(runId, stepCreated(first), { eventCount: 2 });
    // This writer still holds the two-event log.
    const result = await world.events.create(
      runId,
      stepCreated(`step_${ulid()}`),
      { eventCount: 2 }
    );
    expect(eventIdToSlot(result.event!.eventId)).toBe(4);
    expect(result.events?.map((e) => e.correlationId)).toEqual([first]);
  });

  it('accepts a write that carries no eventCount', async () => {
    const runId = await createRun();
    await startRun(runId);
    const result = await world.events.create(runId, stepCreated(`step_${ulid()}`));
    expect(result.events).toBeUndefined();
    expect(eventIdToSlot(result.event!.eventId)).toBe(3);
  });

  it('survives a reload from storage', async () => {
    const runId = await createRun();
    await startRun(runId);
    const before = await world.events.list({ runId });
    // A large payload goes through its own FileStream.
    const big = new Uint8Array(64 * 1024).fill(7);
    await world.events.create(runId, {
      ...stepCreated(`step_${ulid()}`),
      eventData: { stepName: 'step', input: big },
    });
    const after = await world.events.list({ runId });
    expect(after.data).toHaveLength(before.data.length + 1);
    const stored = after.data.at(-1) as { eventData: { input: Uint8Array } };
    expect(stored.eventData.input).toEqual(big);
  });
});

describe('runs', () => {
  it('derives the run from its events', async () => {
    const runId = await createRun();
    expect((await world.runs.get(runId)).status).toBe('pending');
    const started = await startRun(runId);
    expect(started.run?.status).toBe('running');
    expect(started.events?.map((e) => e.eventType)).toEqual([
      'run_created',
      'run_started',
    ]);
    await world.events.create(runId, {
      eventType: 'run_completed',
      specVersion: SPEC_VERSION_CURRENT,
      eventData: { output: input },
    });
    const run = await world.runs.get(runId);
    expect(run.status).toBe('completed');
    expect(run.output).toEqual(input);
  });

  it('throws WorkflowRunNotFoundError for an unknown run', async () => {
    await expect(world.runs.get(newRunId())).rejects.toBeInstanceOf(
      WorkflowRunNotFoundError
    );
  });

  it('filters runs.list by an array of statuses', async () => {
    const workflowName = `wf_${ulid()}`;
    const pending = await createRun(newRunId(), workflowName);
    const running = await createRun(newRunId(), workflowName);
    await startRun(running);
    const all = await world.runs.list({
      workflowName,
      status: ['pending', 'running'],
    });
    expect(all.data.map((r) => r.runId).sort()).toEqual(
      [pending, running].sort()
    );
    const onlyRunning = await world.runs.list({
      workflowName,
      status: ['running'],
    });
    expect(onlyRunning.data.map((r) => r.runId)).toEqual([running]);
    expect((await world.runs.list({ status: [] })).data).toEqual([]);
  });
});

describe('steps', () => {
  it('refuses step_started on a terminal run even while the step is running', async () => {
    const runId = await createRun();
    await startRun(runId);
    const stepId = `step_${ulid()}`;
    await world.events.create(runId, stepCreated(stepId));
    await world.events.create(runId, {
      eventType: 'step_started',
      correlationId: stepId,
      specVersion: SPEC_VERSION_CURRENT,
    });
    await world.events.create(runId, {
      eventType: 'run_cancelled',
      specVersion: SPEC_VERSION_CURRENT,
    });
    await expect(
      world.events.create(runId, {
        eventType: 'step_started',
        correlationId: stepId,
        specVersion: SPEC_VERSION_CURRENT,
      })
    ).rejects.toBeInstanceOf(RunExpiredError);
    // The step in flight can still record its outcome.
    const completed = await world.events.create(runId, {
      eventType: 'step_completed',
      correlationId: stepId,
      specVersion: SPEC_VERSION_CURRENT,
      eventData: { result: input },
    });
    expect(completed.step?.status).toBe('completed');
  });

  it('creates a step from a lazy step_started exactly once', async () => {
    const runId = await createRun();
    await startRun(runId);
    const stepId = `step_${ulid()}`;
    const lazy = {
      eventType: 'step_started',
      correlationId: stepId,
      specVersion: SPEC_VERSION_CURRENT,
      eventData: { stepName: 'step', input },
    } as const;
    const results = await Promise.allSettled([
      world.events.create(runId, lazy),
      world.events.create(runId, lazy),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const types = (await world.events.list({ runId })).data.map(
      (e) => e.eventType
    );
    expect(types).toEqual([
      'run_created',
      'run_started',
      'step_created',
      'step_started',
    ]);
  });
});

describe('hooks', () => {
  it('records a token conflict in the second run and frees the token on completion', async () => {
    const first = await createRun();
    await startRun(first);
    const second = await createRun();
    await startRun(second);
    const hook = (hookId: string) =>
      ({
        eventType: 'hook_created',
        correlationId: hookId,
        specVersion: SPEC_VERSION_CURRENT,
        eventData: { token: 'shared-token' },
      }) as const;
    await world.events.create(first, hook(`hook_${ulid()}`));
    const conflict = await world.events.create(second, hook(`hook_${ulid()}`));
    expect(conflict.event?.eventType).toBe('hook_conflict');
    expect((await world.hooks.getByToken('shared-token')).runId).toBe(first);

    await world.events.create(first, {
      eventType: 'run_completed',
      specVersion: SPEC_VERSION_CURRENT,
      eventData: { output: input },
    });
    await expect(world.hooks.getByToken('shared-token')).rejects.toThrow();
    const created = await world.events.create(second, hook(`hook_${ulid()}`));
    expect(created.event?.eventType).toBe('hook_created');
  });
});

describe('streams', () => {
  it('reads a stream closed before the reader attaches', async () => {
    const runId = await createRun();
    await world.streams.write(runId, 'out', 'a');
    await world.streams.writeMulti!(runId, 'out', ['b', new Uint8Array([99])]);
    await world.streams.close(runId, 'out');
    const reader = (await world.streams.get(runId, 'out')).getReader();
    const chunks: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }
    expect(chunks).toEqual(['a', 'b', 'c']);
    expect(await world.streams.list(runId)).toEqual(['out']);
    expect(await world.streams.getInfo(runId, 'out')).toEqual({
      tailIndex: 2,
      done: true,
    });
  });

  it('delivers chunks written after the reader attaches', async () => {
    const runId = await createRun();
    const reader = (await world.streams.get(runId, 'live')).getReader();
    await world.streams.write(runId, 'live', 'x');
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('x');
    await world.streams.close(runId, 'live');
    expect((await reader.read()).done).toBe(true);
  });
});
