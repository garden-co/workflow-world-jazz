import { types } from 'node:util';
import type { Event, WorkflowRun } from '@vercel/workflow-world';
import { assert, describe, expect, it } from 'vitest';
import type { WorkflowSuspension } from './global.js';
import {
  dehydrateStepReturnValue,
  dehydrateWorkflowArguments,
  hydrateWorkflowReturnValue,
} from './serialization.js';
import { runWorkflow } from './workflow.js';

describe('runWorkflow', () => {
  const getWorkflowTransformCode = (workflowName?: string) =>
    `;globalThis.__private_workflows = new Map();
    ${
      workflowName
        ? `
      globalThis.__private_workflows.set(${JSON.stringify(workflowName)}, ${workflowName})
    `
        : ''
    }
    `;

  describe('successful workflow execution', () => {
    it('should execute a simple workflow successfully', async () => {
      const ops: Promise<any>[] = [];
      const workflowCode =
        'function workflow() { return "success"; }' +
        getWorkflowTransformCode('workflow');

      const workflowRun: WorkflowRun = {
        runId: 'wrun_123',
        workflowName: 'workflow',
        status: 'running',
        input: dehydrateWorkflowArguments([], ops),
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        startedAt: new Date('2024-01-01T00:00:00.000Z'),
        deploymentId: 'test-deployment',
      };

      const events: Event[] = [];

      const result = await runWorkflow(workflowCode, workflowRun, events);
      expect(hydrateWorkflowReturnValue(result as any, ops)).toEqual('success');
    });

    it('should execute workflow with arguments', async () => {
      const ops: Promise<any>[] = [];
      const workflowCode =
        'function workflow(a, b) { return a + b; }' +
        getWorkflowTransformCode('workflow');

      const workflowRun: WorkflowRun = {
        runId: 'wrun_123',
        workflowName: 'workflow',
        status: 'running',
        input: dehydrateWorkflowArguments([1, 2], ops),
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        startedAt: new Date('2024-01-01T00:00:00.000Z'),
        deploymentId: 'test-deployment',
      };

      const events: Event[] = [];

      const result = await runWorkflow(workflowCode, workflowRun, events);
      expect(hydrateWorkflowReturnValue(result as any, ops)).toEqual(3);
    });

    it('allow user code to handle user-defined errors', async () => {
      const ops: Promise<any>[] = [];
      const workflowCode =
        `function workflow() {
        try {
          throw new TypeError("my workflow error");
        } catch (err) {
          return err;
        }
      }` + getWorkflowTransformCode('workflow');

      const workflowRun: WorkflowRun = {
        runId: 'wrun_123',
        workflowName: 'workflow',
        status: 'running',
        input: dehydrateWorkflowArguments([], ops),
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        startedAt: new Date('2024-01-01T00:00:00.000Z'),
        deploymentId: 'test-deployment',
      };

      const events: Event[] = [];

      const result = hydrateWorkflowReturnValue(
        (await runWorkflow(workflowCode, workflowRun, events)) as any,
        ops
      );
      assert(types.isNativeError(result));
      expect(result.name).toEqual('TypeError');
      expect(result.message).toEqual('my workflow error');
    });
  });

  it('should resolve a step that has a `step_completed` event', async () => {
    const ops: Promise<any>[] = [];
    const workflowRunId = 'wrun_123';
    const workflowRun: WorkflowRun = {
      runId: workflowRunId,
      workflowName: 'workflow',
      status: 'running',
      input: dehydrateWorkflowArguments([], ops),
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      startedAt: new Date('2024-01-01T00:00:00.000Z'),
      deploymentId: 'test-deployment',
    };

    const events: Event[] = [
      {
        eventId: 'event-0',
        runId: workflowRunId,
        eventType: 'step_started',
        correlationId: 'step_01HK153X00Y11PCQTCHQRK34HF',
        createdAt: new Date(),
      },
      {
        eventId: 'event-1',
        runId: workflowRunId,
        eventType: 'step_completed',
        correlationId: 'step_01HK153X00Y11PCQTCHQRK34HF',
        eventData: {
          result: dehydrateStepReturnValue(3, ops),
        },
        createdAt: new Date(),
      },
    ];

    const result = await runWorkflow(
      `const add = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("add");
          async function workflow() {
            // 'add()' will throw a 'WorkflowSuspension' because it has not been run yet
            const a = await add(1, 2);
            return a;
          }` + getWorkflowTransformCode('workflow'),
      workflowRun,
      events
    );
    expect(hydrateWorkflowReturnValue(result as any, ops)).toEqual(3);
  });

  it('should update the timestamp in the vm context as events are replayed', async () => {
    const ops: Promise<any>[] = [];
    const workflowRunId = 'wrun_123';
    const workflowRun: WorkflowRun = {
      runId: workflowRunId,
      workflowName: 'workflow',
      status: 'running',
      input: dehydrateWorkflowArguments([], ops),
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      startedAt: new Date('2024-01-01T00:00:00.000Z'),
      deploymentId: 'test-deployment',
    };

    const events: Event[] = [
      {
        eventId: 'event-0',
        runId: workflowRunId,
        eventType: 'step_started',
        correlationId: 'step_01HK153X00Y11PCQTCHQRK34HF',
        createdAt: new Date('2024-01-01T00:00:01.000Z'),
      },
      {
        eventId: 'event-1',
        runId: workflowRunId,
        eventType: 'step_completed',
        correlationId: 'step_01HK153X00Y11PCQTCHQRK34HF',
        eventData: {
          result: dehydrateStepReturnValue(3, ops),
        },
        createdAt: new Date('2024-01-01T00:00:02.000Z'),
      },
      {
        eventId: 'event-2',
        runId: workflowRunId,
        eventType: 'step_started',
        correlationId: 'step_01HK153X00Y11PCQTCHQRK34HG',
        createdAt: new Date('2024-01-01T00:00:03.000Z'),
      },
      {
        eventId: 'event-3',
        runId: workflowRunId,
        eventType: 'step_completed',
        correlationId: 'step_01HK153X00Y11PCQTCHQRK34HG',
        eventData: {
          result: dehydrateStepReturnValue(3, ops),
        },
        createdAt: new Date('2024-01-01T00:00:04.000Z'),
      },
      {
        eventId: 'event-4',
        runId: workflowRunId,
        eventType: 'step_started',
        correlationId: 'step_01HK153X00Y11PCQTCHQRK34HH',
        createdAt: new Date('2024-01-01T00:00:05.000Z'),
      },
      {
        eventId: 'event-5',
        runId: workflowRunId,
        eventType: 'step_completed',
        correlationId: 'step_01HK153X00Y11PCQTCHQRK34HH',
        eventData: {
          result: dehydrateStepReturnValue(3, ops),
        },
        createdAt: new Date('2024-01-01T00:00:06.000Z'),
      },
    ];

    const result = await runWorkflow(
      `const add = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("add");
          async function workflow() {
            const timestamps = [];
            timestamps.push(new Date());
            await add(1, 2);
            timestamps.push(Date.now());
            await add(3, 4);
            timestamps.push(Date.now());
            await add(5, 6);
            timestamps.push(new Date());
            return timestamps;
          }` + getWorkflowTransformCode('workflow'),
      workflowRun,
      events
    );
    expect(hydrateWorkflowReturnValue(result as any, ops)).toEqual([
      new Date('2024-01-01T00:00:00.000Z'),
      1704067203000,
      1704067205000,
      new Date('2024-01-01T00:00:06.000Z'),
    ]);
  });

  // TODO: Date.now determinism is currently broken in the workflow!!
  it.fails(
    'should maintain determinism of `Date` across executions',
    async () => {
      const ops: Promise<any>[] = [];
      const workflowRunId = 'test-run-123';
      const workflowRun: WorkflowRun = {
        runId: workflowRunId,
        workflowName: 'workflow',
        status: 'running',
        input: dehydrateWorkflowArguments([], ops),
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        startedAt: new Date('2024-01-01T00:00:00.000Z'),
        deploymentId: 'test-deployment',
      };

      const events: Event[] = [
        {
          eventId: 'event-0',
          runId: workflowRunId,
          eventType: 'step_started',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JX',
          createdAt: new Date('2024-01-01T00:00:01.000Z'),
        },
        {
          eventId: 'event-1',
          runId: workflowRunId,
          eventType: 'step_started',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JY',
          createdAt: new Date('2024-01-01T00:00:01.000Z'),
        },
        {
          eventId: 'event-2',
          runId: workflowRunId,
          eventType: 'step_completed',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JX',
          eventData: {
            result: dehydrateStepReturnValue(undefined, ops),
          },
          createdAt: new Date('2024-01-01T00:00:03.000Z'),
        },
      ];

      const workflowCode =
        `
      const sleep = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("sleep");
      async function workflow() {
        await Promise.race([sleep(1), sleep(2)]);
        return Date.now();
      }` + getWorkflowTransformCode('workflow');

      // Execute the workflow with only sleep(1) resolved
      const result1 = await runWorkflow(workflowCode, workflowRun, events);

      // Execute again with both sleeps resolved this time
      const result2 = await runWorkflow(workflowCode, workflowRun, [
        ...events,
        {
          eventId: 'event-3',
          runId: workflowRunId,
          eventType: 'step_completed',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JY',
          eventData: {
            result: dehydrateStepReturnValue(undefined, ops),
          },
          createdAt: new Date('2024-01-01T00:00:04.000Z'),
        },
      ]);

      // The date should be the same
      const date1 = hydrateWorkflowReturnValue(result1 as any, ops);
      const date2 = hydrateWorkflowReturnValue(result2 as any, ops);
      expect(date1).toEqual(date2);
    }
  );

  describe('concurrency', () => {
    it('should resolve `Promise.all()` steps that have `step_completed` events', async () => {
      const ops: Promise<any>[] = [];
      const workflowRunId = 'test-run-123';
      const workflowRun: WorkflowRun = {
        runId: workflowRunId,
        workflowName: 'workflow',
        status: 'running',
        input: dehydrateWorkflowArguments([], ops),
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        startedAt: new Date('2024-01-01T00:00:00.000Z'),
        deploymentId: 'test-deployment',
      };

      const events: Event[] = [
        {
          eventId: 'event-0',
          runId: workflowRunId,
          eventType: 'step_started',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JX',
          createdAt: new Date(),
        },
        {
          eventId: 'event-1',
          runId: workflowRunId,
          eventType: 'step_started',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JY',
          createdAt: new Date(),
        },
        {
          eventId: 'event-2',
          runId: workflowRunId,
          eventType: 'step_completed',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JX',
          eventData: {
            result: dehydrateStepReturnValue(3, ops),
          },
          createdAt: new Date(),
        },
        {
          eventId: 'event-3',
          runId: workflowRunId,
          eventType: 'step_completed',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JY',
          eventData: {
            result: dehydrateStepReturnValue(7, ops),
          },
          createdAt: new Date(),
        },
      ];

      const result = await runWorkflow(
        `const add = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("add");
          async function workflow() {
            const a = await Promise.all([add(1, 2), add(3, 4)]);
            return a;
          }` + getWorkflowTransformCode('workflow'),
        workflowRun,
        events
      );
      expect(hydrateWorkflowReturnValue(result as any, ops)).toEqual([3, 7]);
    });

    it('should resolve `Promise.race()` steps that have `step_completed` events (first promise resolves first)', async () => {
      const ops: Promise<any>[] = [];
      const workflowRunId = 'test-run-123';
      const workflowRun: WorkflowRun = {
        runId: workflowRunId,
        workflowName: 'workflow',
        status: 'running',
        input: dehydrateWorkflowArguments([], ops),
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        startedAt: new Date('2024-01-01T00:00:00.000Z'),
        deploymentId: 'test-deployment',
      };

      const events: Event[] = [
        {
          eventId: 'event-0',
          runId: workflowRunId,
          eventType: 'step_started',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JX',
          createdAt: new Date(),
        },
        {
          eventId: 'event-1',
          runId: workflowRunId,
          eventType: 'step_started',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JY',
          createdAt: new Date(),
        },
        {
          eventId: 'event-2',
          runId: workflowRunId,
          eventType: 'step_completed',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JX',
          eventData: {
            result: dehydrateStepReturnValue(3, ops),
          },
          createdAt: new Date(),
        },
        {
          eventId: 'event-3',
          runId: workflowRunId,
          eventType: 'step_completed',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JY',
          eventData: {
            result: dehydrateStepReturnValue(7, ops),
          },
          createdAt: new Date(),
        },
      ];

      const result = await runWorkflow(
        `const add = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("add");
          async function workflow() {
            const a = await Promise.race([add(1, 2), add(3, 4)]);
            return a;
          }` + getWorkflowTransformCode('workflow'),
        workflowRun,
        events
      );
      expect(hydrateWorkflowReturnValue(result as any, ops)).toEqual(3);
    });

    it('should resolve `Promise.race()` steps that have `step_completed` events (second promise resolves first)', async () => {
      const ops: Promise<any>[] = [];
      const workflowRunId = 'test-run-123';
      const workflowRun: WorkflowRun = {
        runId: workflowRunId,
        workflowName: 'workflow',
        status: 'running',
        input: dehydrateWorkflowArguments([], ops),
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        startedAt: new Date('2024-01-01T00:00:00.000Z'),
        deploymentId: 'test-deployment',
      };

      const events: Event[] = [
        {
          eventId: 'event-0',
          runId: workflowRunId,
          eventType: 'step_started',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JX',
          createdAt: new Date(),
        },
        {
          eventId: 'event-1',
          runId: workflowRunId,
          eventType: 'step_started',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JY',
          createdAt: new Date(),
        },
        {
          eventId: 'event-2',
          runId: workflowRunId,
          eventType: 'step_completed',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JX',
          eventData: {
            result: dehydrateStepReturnValue(7, ops),
          },
          createdAt: new Date(),
        },
        {
          eventId: 'event-3',
          runId: workflowRunId,
          eventType: 'step_completed',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JY',
          eventData: {
            result: dehydrateStepReturnValue(3, ops),
          },
          createdAt: new Date(),
        },
      ];

      const result = await runWorkflow(
        `const add = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("add");
          async function workflow() {
            const a = await Promise.race([add(1, 2), add(3, 4)]);
            return a;
          }` + getWorkflowTransformCode('workflow'),
        workflowRun,
        events
      );
      expect(hydrateWorkflowReturnValue(result as any, ops)).toEqual(7);
    });
  });

  describe('error handling', () => {
    it('should throw ReferenceError when workflow code does not return a function', async () => {
      let error: Error | undefined;
      try {
        const ops: Promise<any>[] = [];
        const workflowRun: WorkflowRun = {
          runId: 'test-run-123',
          workflowName: 'value',
          status: 'running',
          input: dehydrateWorkflowArguments([], ops),
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
          startedAt: new Date('2024-01-01T00:00:00.000Z'),
          deploymentId: 'test-deployment',
        };

        const events: Event[] = [];

        await runWorkflow(
          'const value = "test"' + getWorkflowTransformCode(),
          workflowRun,
          events
        );
      } catch (err) {
        error = err as Error;
      }
      assert(error);
      expect(error.name).toEqual('ReferenceError');
      expect(error.message).toEqual(
        'Workflow "value" must be a function, but got "undefined" instead'
      );
    });

    it('should throw user-defined error when workflow code throws an error', async () => {
      let error: Error | undefined;
      try {
        const ops: Promise<any>[] = [];
        const workflowRun: WorkflowRun = {
          runId: 'test-run-123',
          workflowName: 'workflow',
          status: 'running',
          input: dehydrateWorkflowArguments([], ops),
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
          startedAt: new Date('2024-01-01T00:00:00.000Z'),
          deploymentId: 'test-deployment',
        };

        const events: Event[] = [];

        await runWorkflow(
          'function workflow() { throw new Error("test"); }' +
            getWorkflowTransformCode('workflow'),
          workflowRun,
          events
        );
      } catch (err) {
        error = err as Error;
      }
      assert(error);
      expect(error.name).toEqual('Error');
      expect(error.message).toEqual('test');
    });

    it('should throw `WorkflowSuspension` when a step does not have an event result entry', async () => {
      let error: Error | undefined;
      try {
        const ops: Promise<any>[] = [];
        const workflowRun: WorkflowRun = {
          runId: 'test-run-123',
          workflowName: 'workflow',
          status: 'running',
          input: dehydrateWorkflowArguments([], ops),
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
          startedAt: new Date('2024-01-01T00:00:00.000Z'),
          deploymentId: 'test-deployment',
        };

        const events: Event[] = [];

        await runWorkflow(
          `const add = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("add");
          async function workflow() {
            // 'add()' will throw a 'WorkflowSuspension' because it has not been run yet
            const a = await add(1, 2);
            return a;
          }` + getWorkflowTransformCode('workflow'),
          workflowRun,
          events
        );
      } catch (err) {
        error = err as Error;
      }
      assert(error);
      expect(error.name).toEqual('WorkflowSuspension');
      expect(error.message).toEqual('1 steps have not been run yet');
      expect((error as WorkflowSuspension).steps).toEqual([
        {
          type: 'step',
          stepName: 'add',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JX',
          args: [1, 2],
        },
      ]);
    });

    it('should throw `WorkflowSuspension` when a step has only a "step_started" event', async () => {
      let error: Error | undefined;
      try {
        const ops: Promise<any>[] = [];
        const workflowRun: WorkflowRun = {
          runId: 'test-run-123',
          workflowName: 'workflow',
          status: 'running',
          input: dehydrateWorkflowArguments([], ops),
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
          startedAt: new Date('2024-01-01T00:00:00.000Z'),
          deploymentId: 'test-deployment',
        };

        const events: Event[] = [
          {
            eventId: 'event-0',
            runId: workflowRun.runId,
            eventType: 'step_started',
            correlationId: 'step_01HK153X008RT6YEW43G8QX6JX',
            createdAt: new Date(),
          },
        ];

        await runWorkflow(
          `const add = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("add");
          async function workflow() {
            // 'add()' will throw a 'WorkflowSuspension' because it has not been run yet
            const a = await add(1, 2);
            return a;
          }` + getWorkflowTransformCode('workflow'),
          workflowRun,
          events
        );
      } catch (err) {
        error = err as Error;
      }
      assert(error);
      expect(error.name).toEqual('WorkflowSuspension');
      expect(error.message).toEqual('0 steps have not been run yet');
      expect((error as WorkflowSuspension).steps).toEqual([]);
    });

    it('should throw `WorkflowSuspension` for multiple steps with `Promise.all()`', async () => {
      let error: Error | undefined;
      try {
        const ops: Promise<any>[] = [];
        const workflowRun: WorkflowRun = {
          runId: 'test-run-123',
          workflowName: 'workflow',
          status: 'running',
          input: dehydrateWorkflowArguments([], ops),
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
          startedAt: new Date('2024-01-01T00:00:00.000Z'),
          deploymentId: 'test-deployment',
        };

        const events: Event[] = [];

        await runWorkflow(
          `const add = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("add");
          async function workflow() {
            const a = await Promise.all([add(1, 2), add(3, 4)]);
            return a;
          }` + getWorkflowTransformCode('workflow'),
          workflowRun,
          events
        );
      } catch (err) {
        error = err as Error;
      }
      assert(error);
      expect(error.name).toEqual('WorkflowSuspension');
      expect(error.message).toEqual('2 steps have not been run yet');
      expect((error as WorkflowSuspension).steps).toEqual([
        {
          type: 'step',
          stepName: 'add',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JX',
          args: [1, 2],
        },
        {
          type: 'step',
          stepName: 'add',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JY',
          args: [3, 4],
        },
      ]);
    });

    it('`WorkflowSuspension` should not be catchable by user code', async () => {
      let error: Error | undefined;
      try {
        const ops: Promise<any>[] = [];
        const workflowRun: WorkflowRun = {
          runId: 'test-run-123',
          workflowName: 'workflow',
          status: 'running',
          input: dehydrateWorkflowArguments([], ops),
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
          startedAt: new Date('2024-01-01T00:00:00.000Z'),
          deploymentId: 'test-deployment',
        };

        const events: Event[] = [];

        await runWorkflow(
          `const add = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("add");
          async function workflow() {
            try {
              // 'add()' will throw a 'WorkflowSuspension' because it has not been run yet
              const a = await add(1, 2);
              return a;
            } catch (err) {
              return err;
            }
          }` + getWorkflowTransformCode('workflow'),
          workflowRun,
          events
        );
      } catch (err) {
        error = err as Error;
      }
      assert(error);
      expect(error.name).toEqual('WorkflowSuspension');
      expect(error.message).toEqual('1 steps have not been run yet');
    });
  });

  describe('webhook', () => {
    it('should throw `WorkflowSuspension` when a webhook is awaiting without a "webhook_request" event', async () => {
      let error: Error | undefined;
      try {
        const ops: Promise<any>[] = [];
        const workflowRun: WorkflowRun = {
          runId: 'test-run-123',
          workflowName: 'workflow',
          status: 'running',
          input: dehydrateWorkflowArguments([], ops),
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
          startedAt: new Date('2024-01-01T00:00:00.000Z'),
          deploymentId: 'test-deployment',
        };

        const events: Event[] = [];

        await runWorkflow(
          `const getWebhook = globalThis[Symbol.for("WORKFLOW_GET_WEBHOOK")];
          async function workflow() {
            const webhook = getWebhook();
            const req = await webhook;
            return req.url;
          }` + getWorkflowTransformCode('workflow'),
          workflowRun,
          events
        );
      } catch (err) {
        error = err as Error;
      }
      assert(error);
      expect(error.name).toEqual('WorkflowSuspension');
      expect(error.message).toEqual('1 webhooks have not been created yet');
      expect((error as WorkflowSuspension).steps).toHaveLength(1);
      expect((error as WorkflowSuspension).steps[0].type).toEqual('webhook');
    });

    it('should resolve `getWebhook` await upon "webhook_request" event', async () => {
      const ops: Promise<any>[] = [];
      const workflowRun: WorkflowRun = {
        runId: 'test-run-123',
        workflowName: 'workflow',
        status: 'running',
        input: dehydrateWorkflowArguments([], ops),
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        startedAt: new Date('2024-01-01T00:00:00.000Z'),
        deploymentId: 'test-deployment',
      };

      const events: Event[] = [
        {
          eventId: 'event-0',
          runId: workflowRun.runId,
          eventType: 'webhook_request',
          correlationId: 'wbhk_01HK153X008RT6YEW43G8QX6JX',
          eventData: {
            request: dehydrateStepReturnValue(
              new Request('https://example.com'),
              ops
            ),
          },
          createdAt: new Date(),
        },
      ];

      const result = await runWorkflow(
        `const getWebhook = globalThis[Symbol.for("WORKFLOW_GET_WEBHOOK")];
      async function workflow() {
        const webhook = getWebhook();
        const req = await webhook;
        return req.url;
      }` + getWorkflowTransformCode('workflow'),
        workflowRun,
        events
      );
      expect(hydrateWorkflowReturnValue(result as any, ops)).toEqual(
        'https://example.com/'
      );
    });

    it('should resolve multiple `getWebhook` awaits upon "webhook_request" events', async () => {
      const ops: Promise<any>[] = [];
      const workflowRun: WorkflowRun = {
        runId: 'test-run-123',
        workflowName: 'workflow',
        status: 'running',
        input: dehydrateWorkflowArguments([], ops),
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        startedAt: new Date('2024-01-01T00:00:00.000Z'),
        deploymentId: 'test-deployment',
      };

      const events: Event[] = [
        {
          eventId: 'event-0',
          runId: workflowRun.runId,
          eventType: 'webhook_request',
          correlationId: 'wbhk_01HK153X008RT6YEW43G8QX6JX',
          eventData: {
            request: dehydrateStepReturnValue(
              new Request('https://example.com'),
              ops
            ),
          },
          createdAt: new Date(),
        },
        {
          eventId: 'event-1',
          runId: workflowRun.runId,
          eventType: 'webhook_request',
          correlationId: 'wbhk_01HK153X008RT6YEW43G8QX6JX',
          eventData: {
            request: dehydrateStepReturnValue(
              new Request('https://example.com/2'),
              ops
            ),
          },
          createdAt: new Date(),
        },
      ];

      const result = await runWorkflow(
        `const getWebhook = globalThis[Symbol.for("WORKFLOW_GET_WEBHOOK")];
      async function workflow() {
        const webhook = getWebhook();
        const req1 = await webhook;
        const req2 = await webhook;
        return [req1.url, req2.url];
      }` + getWorkflowTransformCode('workflow'),
        workflowRun,
        events
      );
      expect(hydrateWorkflowReturnValue(result as any, ops)).toEqual([
        'https://example.com/',
        'https://example.com/2',
      ]);
    });

    it('should support `for await` loops with `getWebhook`', async () => {
      const ops: Promise<any>[] = [];
      const workflowRun: WorkflowRun = {
        runId: 'test-run-123',
        workflowName: 'workflow',
        status: 'running',
        input: dehydrateWorkflowArguments([], ops),
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        startedAt: new Date('2024-01-01T00:00:00.000Z'),
        deploymentId: 'test-deployment',
      };

      const events: Event[] = [
        {
          eventId: 'event-0',
          runId: workflowRun.runId,
          eventType: 'webhook_request',
          correlationId: 'wbhk_01HK153X008RT6YEW43G8QX6JX',
          eventData: {
            request: dehydrateStepReturnValue(
              new Request('https://example.com'),
              ops
            ),
          },
          createdAt: new Date(),
        },
        {
          eventId: 'event-1',
          runId: workflowRun.runId,
          eventType: 'webhook_request',
          correlationId: 'wbhk_01HK153X008RT6YEW43G8QX6JX',
          eventData: {
            request: dehydrateStepReturnValue(
              new Request('https://example.com/2', {
                method: 'POST',
              }),
              ops
            ),
          },
          createdAt: new Date(),
        },
      ];

      const result = await runWorkflow(
        `const getWebhook = globalThis[Symbol.for("WORKFLOW_GET_WEBHOOK")];
      async function workflow() {
        const webhook = getWebhook();
        const reqs = [];
        for await (const req of webhook) {
          reqs.push({ url: req.url, method: req.method });
          if (reqs.length === 2) {
            break;
          }
        }
        return reqs;
      }` + getWorkflowTransformCode('workflow'),
        workflowRun,
        events
      );
      expect(hydrateWorkflowReturnValue(result as any, ops)).toEqual([
        { url: 'https://example.com/', method: 'GET' },
        { url: 'https://example.com/2', method: 'POST' },
      ]);
    });

    it('should support multiple "webhook_request" events even when the workflow is only interested in one', async () => {
      const ops: Promise<any>[] = [];
      const workflowRun: WorkflowRun = {
        runId: 'test-run-123',
        workflowName: 'workflow',
        status: 'running',
        input: dehydrateWorkflowArguments([], ops),
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        startedAt: new Date('2024-01-01T00:00:00.000Z'),
        deploymentId: 'test-deployment',
      };

      const events: Event[] = [
        {
          eventId: 'event-0',
          runId: workflowRun.runId,
          eventType: 'webhook_request',
          correlationId: 'wbhk_01HK153X008RT6YEW43G8QX6JX',
          eventData: {
            request: dehydrateStepReturnValue(
              new Request('https://example.com'),
              ops
            ),
          },
          createdAt: new Date(),
        },
        {
          eventId: 'event-1',
          runId: workflowRun.runId,
          eventType: 'webhook_request',
          correlationId: 'wbhk_01HK153X008RT6YEW43G8QX6JX',
          eventData: {
            request: dehydrateStepReturnValue(
              new Request('https://example.com/2', {
                method: 'POST',
              }),
              ops
            ),
          },
          createdAt: new Date(),
        },
      ];

      const result = await runWorkflow(
        `const getWebhook = globalThis[Symbol.for("WORKFLOW_GET_WEBHOOK")];
      async function workflow() {
        const webhook = getWebhook();
        const req = await webhook;
        return { url: req.url, method: req.method };
      }` + getWorkflowTransformCode('workflow'),
        workflowRun,
        events
      );
      expect(hydrateWorkflowReturnValue(result as any, ops)).toEqual({
        url: 'https://example.com/',
        method: 'GET',
      });
    });

    it('should support multiple queued "webhook_request" events with step events in between', async () => {
      const ops: Promise<any>[] = [];
      const workflowRun: WorkflowRun = {
        runId: 'test-run-123',
        workflowName: 'workflow',
        status: 'running',
        input: dehydrateWorkflowArguments([], ops),
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        startedAt: new Date('2024-01-01T00:00:00.000Z'),
        deploymentId: 'test-deployment',
      };

      const events: Event[] = [
        {
          eventId: 'event-0',
          runId: workflowRun.runId,
          eventType: 'webhook_request',
          correlationId: 'wbhk_01HK153X008RT6YEW43G8QX6JX',
          eventData: {
            request: dehydrateStepReturnValue(
              new Request('https://example.com'),
              ops
            ),
          },
          createdAt: new Date('2024-01-01T00:00:01.000Z'),
        },
        {
          eventId: 'event-1',
          runId: workflowRun.runId,
          eventType: 'webhook_request',
          correlationId: 'wbhk_01HK153X008RT6YEW43G8QX6JX',
          eventData: {
            request: dehydrateStepReturnValue(
              new Request('https://example.com/2', {
                method: 'POST',
              }),
              ops
            ),
          },
          createdAt: new Date('2024-01-01T00:00:02.000Z'),
        },
        {
          eventId: 'event-2',
          runId: workflowRun.runId,
          eventType: 'step_started',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JY',
          createdAt: new Date('2024-01-01T00:00:03.000Z'),
        },
        {
          eventId: 'event-3',
          runId: workflowRun.runId,
          eventType: 'step_completed',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JY',
          eventData: {
            result: dehydrateStepReturnValue(3, ops),
          },
          createdAt: new Date('2024-01-01T00:00:04.000Z'),
        },
      ];

      const result = await runWorkflow(
        `const getWebhook = globalThis[Symbol.for("WORKFLOW_GET_WEBHOOK")];
      const add = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("add");
      async function workflow() {
        const webhook = getWebhook();
        const req1 = await webhook;
        const a = await add(1, 2);
        const req2 = await webhook;
        return {
          url: req1.url,
          method: req1.method,
          a,
          url2: req2.url,
          method2: req2.method,
        };
      }` + getWorkflowTransformCode('workflow'),
        workflowRun,
        events
      );
      expect(hydrateWorkflowReturnValue(result as any, ops)).toEqual({
        url: 'https://example.com/',
        method: 'GET',
        a: 3,
        url2: 'https://example.com/2',
        method2: 'POST',
      });
    });

    it('should throw `WorkflowSuspension` when a webhook is awaited after the event log is empty', async () => {
      const ops: Promise<any>[] = [];
      const workflowRun: WorkflowRun = {
        runId: 'test-run-123',
        workflowName: 'workflow',
        status: 'running',
        input: dehydrateWorkflowArguments([], ops),
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        startedAt: new Date('2024-01-01T00:00:00.000Z'),
        deploymentId: 'test-deployment',
      };

      const events: Event[] = [
        {
          eventId: 'event-0',
          runId: workflowRun.runId,
          eventType: 'webhook_request',
          correlationId: 'wbhk_01HK153X008RT6YEW43G8QX6JX',
          eventData: {
            request: dehydrateStepReturnValue(
              new Request('https://example.com'),
              ops
            ),
          },
          createdAt: new Date('2024-01-01T00:00:01.000Z'),
        },
        {
          eventId: 'event-1',
          runId: workflowRun.runId,
          eventType: 'step_started',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JY',
          createdAt: new Date('2024-01-01T00:00:02.000Z'),
        },
        {
          eventId: 'event-2',
          runId: workflowRun.runId,
          eventType: 'step_completed',
          correlationId: 'step_01HK153X008RT6YEW43G8QX6JY',
          eventData: {
            result: dehydrateStepReturnValue(3, ops),
          },
          createdAt: new Date('2024-01-01T00:00:03.000Z'),
        },
      ];

      let error: Error | undefined;
      try {
        await runWorkflow(
          `const getWebhook = globalThis[Symbol.for("WORKFLOW_GET_WEBHOOK")];
      const add = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("add");
      async function workflow() {
        const webhook = getWebhook();
        for await (const req of webhook) {
          await add(1, 2);
        }
      }` + getWorkflowTransformCode('workflow'),
          workflowRun,
          events
        );
      } catch (err) {
        error = err as Error;
      }
      assert(error);
      expect(error.name).toEqual('WorkflowSuspension');
      expect(error.message).toEqual('1 webhooks have not been created yet');
      expect((error as WorkflowSuspension).steps).toHaveLength(1);
      expect((error as WorkflowSuspension).steps[0].type).toEqual('webhook');
    });
  });
});
