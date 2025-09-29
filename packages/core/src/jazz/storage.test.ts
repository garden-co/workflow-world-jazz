import { beforeEach, describe, expect, it } from 'vitest';
import { createJazzTestAccount } from 'jazz-tools/testing';
import { JazzStorageAccount } from './types.js';
import { createStorage } from './storage.js';
import { Storage } from '../world/interfaces.js';
import { WorkflowRun } from '../world/runs.js';
import { Step } from '../world/steps.js';
import { Event } from '../world/events.js';
import { Webhook } from '../world/webhooks.js';

describe('JazzStorage', () => {
  let storage: Storage;

  async function newStorage(): Promise<Storage> {
    const worker = await createJazzTestAccount({
      isCurrentActiveAccount: true,
      AccountSchema: JazzStorageAccount,
    });
    const rootPromise = (
      await worker.$jazz.ensureLoaded({
        resolve: {
          root: true,
        },
      })
    ).root;
    return createStorage(Promise.resolve(rootPromise));
  }

  beforeEach(async () => {
    storage = await newStorage();
  });

  describe('runs', () => {
    describe('create', () => {
      it('should create a new workflow run with all required fields', async () => {
        const createRequest = {
          deploymentId: 'test-deployment',
          workflowName: 'test-workflow',
          input: ['arg1', 'arg2', { nested: 'object' }],
          executionContext: { userId: 'user123', environment: 'test' },
        };

        const result = await storage.runs.create(createRequest);

        expect(result).toMatchObject({
          status: 'pending',
          ...createRequest,
        });
        expect(result.runId).toBeDefined();
        expect(result.createdAt).toBeInstanceOf(Date);
        expect(result.updatedAt).toBeInstanceOf(Date);
        expect(result.startedAt).toBeUndefined();
        expect(result.completedAt).toBeUndefined();
        expect(result.output).toBeUndefined();
        expect(result.error).toBeUndefined();
        expect(result.errorCode).toBeUndefined();
      });

      it('should create a workflow run without execution context', async () => {
        const createRequest = {
          deploymentId: 'test-deployment',
          workflowName: 'test-workflow',
          input: ['simple', 'args'],
        };

        const result = await storage.runs.create(createRequest);

        expect(result).toMatchObject({
          status: 'pending',
          executionContext: undefined,
          ...createRequest,
        });
      });

      it('should create a workflow run with empty input array', async () => {
        const createRequest = {
          deploymentId: 'test-deployment',
          workflowName: 'test-workflow',
          input: [],
        };

        const result = await storage.runs.create(createRequest);

        expect(result.input).toEqual([]);
      });

      it('should handle complex JSON serializable input', async () => {
        const complexInput = [
          { nested: { deeply: { value: 42 } } },
          [1, 2, { mixed: 'array' }],
          null,
          true,
          3.14,
        ];

        const createRequest = {
          deploymentId: 'test-deployment',
          workflowName: 'test-workflow',
          input: complexInput,
        };

        const result = await storage.runs.create(createRequest);

        expect(result.input).toEqual(complexInput);
      });
    });

    describe('get', () => {
      it('should retrieve an existing workflow run', async () => {
        const createRequest = {
          deploymentId: 'test-deployment',
          workflowName: 'test-workflow',
          input: ['test', 'data'],
        };

        const created = await storage.runs.create(createRequest);
        const retrieved = await storage.runs.get(created.runId);

        expect(retrieved).toEqual(created);
      });

      it('should throw error when run does not exist', async () => {
        await expect(storage.runs.get('non-existent-id')).rejects.toThrow();
      });

      it('should retrieve run with all fields populated', async () => {
        const createRequest = {
          deploymentId: 'test-deployment',
          workflowName: 'test-workflow',
          input: ['test'],
          executionContext: { key: 'value' },
        };

        const created = await storage.runs.create(createRequest);

        // Update the run to have all fields - first set to running to get startedAt
        await storage.runs.update(created.runId, {
          status: 'running',
        });

        const updated = await storage.runs.update(created.runId, {
          status: 'completed',
          output: { result: 'success' },
        });

        const retrieved = await storage.runs.get(created.runId);

        expect(retrieved).toEqual(updated);
        expect(retrieved.status).toBe('completed');
        expect(retrieved.output).toEqual({ result: 'success' });
        expect(retrieved.startedAt).toBeDefined();
        expect(retrieved.completedAt).toBeDefined();
      });
    });

    describe('update', () => {
      let createdRun: WorkflowRun;

      beforeEach(async () => {
        const createRequest = {
          deploymentId: 'test-deployment',
          workflowName: 'test-workflow',
          input: ['initial', 'data'],
        };
        createdRun = await storage.runs.create(createRequest);
      });

      it('should update status to running and set startedAt', async () => {
        const updated = await storage.runs.update(createdRun.runId, {
          status: 'running',
        });

        expect(updated.status).toBe('running');
        expect(updated.startedAt).toBeInstanceOf(Date);
        expect(updated.updatedAt.getTime()).toBeGreaterThan(
          createdRun.updatedAt.getTime()
        );
        expect(updated.completedAt).toBeUndefined();
      });

      it('should update status to completed and set completedAt', async () => {
        const updated = await storage.runs.update(createdRun.runId, {
          status: 'completed',
          output: { result: 'success' },
        });

        expect(updated.status).toBe('completed');
        expect(updated.output).toEqual({ result: 'success' });
        expect(updated.completedAt).toBeInstanceOf(Date);
        expect(updated.updatedAt.getTime()).toBeGreaterThan(
          createdRun.updatedAt.getTime()
        );
      });

      it('should update status to failed and set completedAt', async () => {
        const updated = await storage.runs.update(createdRun.runId, {
          status: 'failed',
          error: 'Something went wrong',
          errorCode: 'RUNTIME_ERROR',
        });

        expect(updated.status).toBe('failed');
        expect(updated.error).toBe('Something went wrong');
        expect(updated.errorCode).toBe('RUNTIME_ERROR');
        expect(updated.completedAt).toBeInstanceOf(Date);
      });

      it('should update status to cancelled and set completedAt', async () => {
        const updated = await storage.runs.update(createdRun.runId, {
          status: 'cancelled',
        });

        expect(updated.status).toBe('cancelled');
        expect(updated.completedAt).toBeInstanceOf(Date);
      });

      it('should update execution context', async () => {
        const newContext = { userId: 'user456', sessionId: 'session789' };
        const updated = await storage.runs.update(createdRun.runId, {
          executionContext: newContext,
        });

        expect(updated.executionContext).toEqual(newContext);
      });

      it('should update multiple fields at once', async () => {
        const updated = await storage.runs.update(createdRun.runId, {
          status: 'running',
          executionContext: { step: 'processing' },
        });

        expect(updated.status).toBe('running');
        expect(updated.executionContext).toEqual({ step: 'processing' });
        expect(updated.startedAt).toBeInstanceOf(Date);
      });

      it('should throw error when run does not exist', async () => {
        await expect(
          storage.runs.update('non-existent-id', { status: 'running' })
        ).rejects.toThrow();
      });

      it('should handle partial updates', async () => {
        // First set some data
        await storage.runs.update(createdRun.runId, {
          status: 'running',
          executionContext: { initial: 'context' },
        });

        // Then update only status
        const updated = await storage.runs.update(createdRun.runId, {
          status: 'completed',
        });

        expect(updated.status).toBe('completed');
        expect(updated.executionContext).toEqual({ initial: 'context' });
        expect(updated.completedAt).toBeInstanceOf(Date);
      });
    });

    describe('list', () => {
      beforeEach(async () => {
        // Create multiple runs for testing
        const runs = [
          {
            deploymentId: 'deployment-1',
            workflowName: 'workflow-a',
            input: ['data1'],
          },
          {
            deploymentId: 'deployment-1',
            workflowName: 'workflow-b',
            input: ['data2'],
          },
          {
            deploymentId: 'deployment-2',
            workflowName: 'workflow-a',
            input: ['data3'],
          },
        ];

        for (const run of runs) {
          await storage.runs.create(run);
        }
      });

      it('should list all runs when no filters are provided', async () => {
        const result = await storage.runs.list();

        expect(result.data).toHaveLength(3);
        expect(result.hasMore).toBe(false);
        expect(result.cursor).toBeNull();
        expect(result.data.map((run) => run.deploymentId)).toEqual([
          'deployment-1',
          'deployment-1',
          'deployment-2',
        ]);
      });

      it('should filter by workflow name', async () => {
        const result = await storage.runs.list({
          workflowName: 'workflow-a',
        });

        expect(result.data).toHaveLength(2);
        expect(result.data.map((run) => run.deploymentId)).toEqual([
          'deployment-1',
          'deployment-2',
        ]);
        expect(
          result.data.every((run) => run.workflowName === 'workflow-a')
        ).toBe(true);
      });

      it('should filter by status', async () => {
        // Update one run to have a different status
        const allRuns = await storage.runs.list();
        await storage.runs.update(allRuns.data[0].runId, { status: 'running' });

        const result = await storage.runs.list({ status: 'running' });

        expect(result.data).toHaveLength(1);
        expect(result.data[0].status).toBe('running');
      });

      it('should filter by both workflow name and status', async () => {
        // Update workflow-a runs to have different statuses
        const allRuns = await storage.runs.list({ workflowName: 'workflow-a' });
        await storage.runs.update(allRuns.data[0].runId, { status: 'running' });

        const result = await storage.runs.list({
          workflowName: 'workflow-a',
          status: 'running',
        });

        expect(result.data).toHaveLength(1);
        expect(result.data[0].workflowName).toBe('workflow-a');
        expect(result.data[0].status).toBe('running');
      });

      it('should handle pagination with limit', async () => {
        const result = await storage.runs.list({
          pagination: { limit: 2 },
        });

        expect(result.data).toHaveLength(2);
        expect(result.hasMore).toBe(true);
        expect(result.cursor).toBeDefined();
      });

      it('should handle pagination with cursor', async () => {
        const firstPage = await storage.runs.list({
          pagination: { limit: 2 },
        });

        const secondPage = await storage.runs.list({
          pagination: {
            limit: 2,
            cursor: firstPage.cursor!,
          },
        });

        expect(secondPage.data).toHaveLength(1);
        expect(secondPage.hasMore).toBe(false);
        expect(secondPage.cursor).toBeNull();

        // Ensure no overlap between pages
        const firstPageIds = firstPage.data.map((run) => run.runId);
        const secondPageIds = secondPage.data.map((run) => run.runId);
        expect(firstPageIds).not.toEqual(expect.arrayContaining(secondPageIds));
      });

      it('should return empty result when no runs match filter', async () => {
        const result = await storage.runs.list({
          workflowName: 'non-existent-workflow',
        });

        expect(result.data).toHaveLength(0);
        expect(result.hasMore).toBe(false);
        expect(result.cursor).toBeNull();
      });

      it('should return empty result when no runs exist', async () => {
        // Create a fresh storage instance
        const freshStorage = await newStorage();

        const result = await freshStorage.runs.list();

        expect(result.data).toHaveLength(0);
        expect(result.hasMore).toBe(false);
        expect(result.cursor).toBeNull();
      });
    });

    describe('cancel', () => {
      it('should cancel a workflow run', async () => {
        const createRequest = {
          deploymentId: 'test-deployment',
          workflowName: 'test-workflow',
          input: ['test', 'data'],
        };

        const created = await storage.runs.create(createRequest);
        const cancelled = await storage.runs.cancel(created.runId);

        expect(cancelled.status).toBe('cancelled');
        expect(cancelled.completedAt).toBeInstanceOf(Date);
        expect(cancelled.updatedAt.getTime()).toBeGreaterThan(
          created.updatedAt.getTime()
        );
      });

      it('should throw error when trying to cancel non-existent run', async () => {
        await expect(storage.runs.cancel('non-existent-id')).rejects.toThrow();
      });
    });

    describe('pause', () => {
      it('should pause a workflow run', async () => {
        const createRequest = {
          deploymentId: 'test-deployment',
          workflowName: 'test-workflow',
          input: ['test', 'data'],
        };

        const created = await storage.runs.create(createRequest);
        const paused = await storage.runs.pause(created.runId);

        expect(paused.status).toBe('paused');
        expect(paused.updatedAt.getTime()).toBeGreaterThan(
          created.updatedAt.getTime()
        );
        expect(paused.completedAt).toBeUndefined();
      });

      it('should throw error when trying to pause non-existent run', async () => {
        await expect(storage.runs.pause('non-existent-id')).rejects.toThrow();
      });
    });

    describe('resume', () => {
      it('should resume a paused workflow run', async () => {
        const createRequest = {
          deploymentId: 'test-deployment',
          workflowName: 'test-workflow',
          input: ['test', 'data'],
        };

        const created = await storage.runs.create(createRequest);
        const paused = await storage.runs.pause(created.runId);

        // Add a small delay to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 1));

        const resumed = await storage.runs.resume(created.runId);

        expect(resumed.status).toBe('running');
        expect(resumed.startedAt).toBeInstanceOf(Date);
        expect(resumed.updatedAt.getTime()).toBeGreaterThanOrEqual(
          paused.updatedAt.getTime()
        );
      });

      it('should throw error when trying to resume non-existent run', async () => {
        await expect(storage.runs.resume('non-existent-id')).rejects.toThrow();
      });
    });

    describe('integration scenarios', () => {
      it('should handle complete workflow lifecycle', async () => {
        // Create
        const created = await storage.runs.create({
          deploymentId: 'test-deployment',
          workflowName: 'lifecycle-test',
          input: ['start'],
        });

        expect(created.status).toBe('pending');

        // Start
        const started = await storage.runs.update(created.runId, {
          status: 'running',
        });
        expect(started.status).toBe('running');
        expect(started.startedAt).toBeDefined();

        // Pause
        const paused = await storage.runs.pause(created.runId);
        expect(paused.status).toBe('paused');

        // Resume
        const resumed = await storage.runs.resume(created.runId);
        expect(resumed.status).toBe('running');

        // Complete
        const completed = await storage.runs.update(created.runId, {
          status: 'completed',
          output: { result: 'success' },
        });
        expect(completed.status).toBe('completed');
        expect(completed.output).toEqual({ result: 'success' });
        expect(completed.completedAt).toBeDefined();
      });

      it('should handle error scenario', async () => {
        const created = await storage.runs.create({
          deploymentId: 'test-deployment',
          workflowName: 'error-test',
          input: ['will-fail'],
        });

        const failed = await storage.runs.update(created.runId, {
          status: 'failed',
          error: 'Runtime error occurred',
          errorCode: 'RUNTIME_ERROR',
        });

        expect(failed.status).toBe('failed');
        expect(failed.error).toBe('Runtime error occurred');
        expect(failed.errorCode).toBe('RUNTIME_ERROR');
        expect(failed.completedAt).toBeDefined();
      });

      it('should maintain data integrity across operations', async () => {
        const originalInput = ['complex', { nested: 'data' }, 42];
        const originalContext = { userId: 'user123', sessionId: 'session456' };

        const created = await storage.runs.create({
          deploymentId: 'test-deployment',
          workflowName: 'integrity-test',
          input: originalInput,
          executionContext: originalContext,
        });

        // Update status multiple times
        await storage.runs.update(created.runId, { status: 'running' });
        await storage.runs.update(created.runId, { status: 'completed' });

        const final = await storage.runs.get(created.runId);

        expect(final.input).toEqual(originalInput);
        expect(final.executionContext).toEqual(originalContext);
        expect(final.status).toBe('completed');
        expect(final.startedAt).toBeDefined();
        expect(final.completedAt).toBeDefined();
      });
    });
  });

  describe('steps', () => {
    let testRunId: string;

    beforeEach(async () => {
      // Create a test run to associate steps with
      const createdRun = await storage.runs.create({
        deploymentId: 'test-deployment',
        workflowName: 'test-workflow',
        input: ['test', 'data'],
      });
      testRunId = createdRun.runId;
    });

    describe('create', () => {
      it('should create a new step with all required fields', async () => {
        const createRequest = {
          stepId: 'step-1',
          stepName: 'test-step',
          input: ['arg1', 'arg2', { nested: 'object' }],
        };

        const result = await storage.steps.create(testRunId, createRequest);

        expect(result).toMatchObject({
          runId: testRunId,
          status: 'pending',
          attempt: 1,
          ...createRequest,
        });
        expect(result.createdAt).toBeInstanceOf(Date);
        expect(result.updatedAt).toBeInstanceOf(Date);
        expect(result.startedAt).toBeUndefined();
        expect(result.completedAt).toBeUndefined();
        expect(result.output).toBeUndefined();
        expect(result.error).toBeUndefined();
        expect(result.errorCode).toBeUndefined();
      });

      it('should create a step with empty input array', async () => {
        const createRequest = {
          stepId: 'step-empty',
          stepName: 'empty-step',
          input: [],
        };

        const result = await storage.steps.create(testRunId, createRequest);

        expect(result.input).toEqual([]);
        expect(result.stepId).toBe('step-empty');
        expect(result.stepName).toBe('empty-step');
      });

      it('should handle complex JSON serializable input', async () => {
        const complexInput = [
          { nested: { deeply: { value: 42 } } },
          [1, 2, { mixed: 'array' }],
          null,
          true,
          3.14,
        ];

        const createRequest = {
          stepId: 'step-complex',
          stepName: 'complex-step',
          input: complexInput,
        };

        const result = await storage.steps.create(testRunId, createRequest);

        expect(result.input).toEqual(complexInput);
      });

      it('should create multiple steps for the same run', async () => {
        const step1 = await storage.steps.create(testRunId, {
          stepId: 'step-1',
          stepName: 'first-step',
          input: ['data1'],
        });

        const step2 = await storage.steps.create(testRunId, {
          stepId: 'step-2',
          stepName: 'second-step',
          input: ['data2'],
        });

        expect(step1.runId).toBe(testRunId);
        expect(step2.runId).toBe(testRunId);
        expect(step1.stepId).toBe('step-1');
        expect(step2.stepId).toBe('step-2');
        expect(step1.stepName).toBe('first-step');
        expect(step2.stepName).toBe('second-step');
      });
    });

    describe('get', () => {
      it('should retrieve an existing step', async () => {
        const createRequest = {
          stepId: 'step-1',
          stepName: 'test-step',
          input: ['test', 'data'],
        };

        const created = await storage.steps.create(testRunId, createRequest);
        const retrieved = await storage.steps.get(testRunId, created.stepId);

        expect(retrieved).toEqual(created);
      });

      it('should throw error when step does not exist', async () => {
        await expect(
          storage.steps.get(testRunId, 'non-existent-step')
        ).rejects.toThrow();
      });

      it('should throw error when run does not exist', async () => {
        await expect(
          storage.steps.get('non-existent-run', 'step-1')
        ).rejects.toThrow();
      });

      it('should retrieve step with all fields populated', async () => {
        const createRequest = {
          stepId: 'step-complete',
          stepName: 'complete-step',
          input: ['test'],
        };

        const created = await storage.steps.create(testRunId, createRequest);

        // Update the step to have all fields - first set to running to get startedAt
        await storage.steps.update(testRunId, created.stepId, {
          status: 'running',
        });

        const updated = await storage.steps.update(testRunId, created.stepId, {
          status: 'completed',
          output: { result: 'success' },
        });

        const retrieved = await storage.steps.get(testRunId, created.stepId);

        expect(retrieved).toEqual(updated);
        expect(retrieved.status).toBe('completed');
        expect(retrieved.output).toEqual({ result: 'success' });
        expect(retrieved.startedAt).toBeDefined();
        expect(retrieved.completedAt).toBeDefined();
      });
    });

    describe('update', () => {
      let createdStep: Step;

      beforeEach(async () => {
        const createRequest = {
          stepId: 'step-1',
          stepName: 'test-step',
          input: ['initial', 'data'],
        };
        createdStep = await storage.steps.create(testRunId, createRequest);
      });

      it('should update status to running and set startedAt', async () => {
        const updated = await storage.steps.update(
          testRunId,
          createdStep.stepId,
          {
            status: 'running',
          }
        );

        expect(updated.status).toBe('running');
        expect(updated.startedAt).toBeInstanceOf(Date);
        expect(updated.updatedAt.getTime()).toBeGreaterThan(
          createdStep.updatedAt.getTime()
        );
        expect(updated.completedAt).toBeUndefined();
      });

      it('should update status to completed and set completedAt', async () => {
        const updated = await storage.steps.update(
          testRunId,
          createdStep.stepId,
          {
            status: 'completed',
            output: { result: 'success' },
          }
        );

        expect(updated.status).toBe('completed');
        expect(updated.output).toEqual({ result: 'success' });
        expect(updated.completedAt).toBeInstanceOf(Date);
        expect(updated.updatedAt.getTime()).toBeGreaterThan(
          createdStep.updatedAt.getTime()
        );
      });

      it('should update status to failed and set completedAt', async () => {
        const updated = await storage.steps.update(
          testRunId,
          createdStep.stepId,
          {
            status: 'failed',
            error: 'Something went wrong',
            errorCode: 'RUNTIME_ERROR',
          }
        );

        expect(updated.status).toBe('failed');
        expect(updated.error).toBe('Something went wrong');
        expect(updated.errorCode).toBe('RUNTIME_ERROR');
        expect(updated.completedAt).toBeInstanceOf(Date);
      });

      it('should update status to cancelled and NOT set completedAt', async () => {
        const updated = await storage.steps.update(
          testRunId,
          createdStep.stepId,
          {
            status: 'cancelled',
          }
        );

        expect(updated.status).toBe('cancelled');
        expect(updated.completedAt).toBeUndefined();
      });

      it('should update multiple fields at once', async () => {
        const updated = await storage.steps.update(
          testRunId,
          createdStep.stepId,
          {
            status: 'running',
            output: { intermediate: 'result' },
          }
        );

        expect(updated.status).toBe('running');
        expect(updated.output).toEqual({ intermediate: 'result' });
        expect(updated.startedAt).toBeInstanceOf(Date);
      });

      it('should throw error when step does not exist', async () => {
        await expect(
          storage.steps.update(testRunId, 'non-existent-step', {
            status: 'running',
          })
        ).rejects.toThrow();
      });

      it('should throw error when run does not exist', async () => {
        await expect(
          storage.steps.update('non-existent-run', createdStep.stepId, {
            status: 'running',
          })
        ).rejects.toThrow();
      });

      it('should handle partial updates', async () => {
        // First set some data
        await storage.steps.update(testRunId, createdStep.stepId, {
          status: 'running',
          output: { initial: 'output' },
        });

        // Then update only status
        const updated = await storage.steps.update(
          testRunId,
          createdStep.stepId,
          {
            status: 'completed',
          }
        );

        expect(updated.status).toBe('completed');
        expect(updated.output).toEqual({ initial: 'output' });
        expect(updated.completedAt).toBeInstanceOf(Date);
      });

      it('should handle complex output data', async () => {
        const complexOutput = {
          nested: { deeply: { value: 42 } },
          array: [1, 2, { mixed: 'array' }],
          nullValue: null,
          booleanValue: true,
          numberValue: 3.14,
        };

        const updated = await storage.steps.update(
          testRunId,
          createdStep.stepId,
          {
            status: 'completed',
            output: complexOutput,
          }
        );

        expect(updated.output).toEqual(complexOutput);
      });
    });

    describe('list', () => {
      beforeEach(async () => {
        // Create multiple steps for testing
        const steps = [
          {
            stepId: 'step-1',
            stepName: 'first-step',
            input: ['data1'],
          },
          {
            stepId: 'step-2',
            stepName: 'second-step',
            input: ['data2'],
          },
          {
            stepId: 'step-3',
            stepName: 'third-step',
            input: ['data3'],
          },
        ];

        for (const step of steps) {
          await storage.steps.create(testRunId, step);
        }
      });

      it('should list all steps when no pagination is provided', async () => {
        const result = await storage.steps.list({ runId: testRunId });

        expect(result.data).toHaveLength(3);
        expect(result.hasMore).toBe(false);
        expect(result.cursor).toBeNull();
        expect(result.data.map((step) => step.stepId)).toEqual([
          'step-1',
          'step-2',
          'step-3',
        ]);
      });

      it('should handle pagination with limit', async () => {
        const result = await storage.steps.list({
          runId: testRunId,
          pagination: { limit: 2 },
        });

        expect(result.data).toHaveLength(2);
        expect(result.hasMore).toBe(true);
        expect(result.cursor).toBeDefined();
      });

      it('should handle pagination with cursor', async () => {
        const firstPage = await storage.steps.list({
          runId: testRunId,
          pagination: { limit: 2 },
        });

        const secondPage = await storage.steps.list({
          runId: testRunId,
          pagination: {
            limit: 2,
            cursor: firstPage.cursor!,
          },
        });

        expect(secondPage.data).toHaveLength(1);
        expect(secondPage.hasMore).toBe(false);
        expect(secondPage.cursor).toBeNull();

        // Ensure no overlap between pages
        const firstPageIds = firstPage.data.map((step) => step.stepId);
        const secondPageIds = secondPage.data.map((step) => step.stepId);
        expect(firstPageIds).not.toEqual(expect.arrayContaining(secondPageIds));
      });

      it('should return empty result when no steps exist for run', async () => {
        // Create a fresh run with no steps
        const freshRun = await storage.runs.create({
          deploymentId: 'fresh-deployment',
          workflowName: 'fresh-workflow',
          input: ['fresh'],
        });

        const result = await storage.steps.list({ runId: freshRun.runId });

        expect(result.data).toHaveLength(0);
        expect(result.hasMore).toBe(false);
        expect(result.cursor).toBeNull();
      });

      it('should return empty result when run does not exist', async () => {
        const result = await storage.steps.list({ runId: 'non-existent-run' });

        expect(result.data).toHaveLength(0);
        expect(result.hasMore).toBe(false);
        expect(result.cursor).toBeNull();
      });
    });

    describe('integration scenarios', () => {
      it('should handle complete step lifecycle', async () => {
        // Create
        const created = await storage.steps.create(testRunId, {
          stepId: 'lifecycle-step',
          stepName: 'lifecycle-test',
          input: ['start'],
        });

        expect(created.status).toBe('pending');

        // Start
        const started = await storage.steps.update(testRunId, created.stepId, {
          status: 'running',
        });
        expect(started.status).toBe('running');
        expect(started.startedAt).toBeDefined();

        // Complete
        const completed = await storage.steps.update(
          testRunId,
          created.stepId,
          {
            status: 'completed',
            output: { result: 'success' },
          }
        );
        expect(completed.status).toBe('completed');
        expect(completed.output).toEqual({ result: 'success' });
        expect(completed.completedAt).toBeDefined();
      });

      it('should handle error scenario', async () => {
        const created = await storage.steps.create(testRunId, {
          stepId: 'error-step',
          stepName: 'error-test',
          input: ['will-fail'],
        });

        const failed = await storage.steps.update(testRunId, created.stepId, {
          status: 'failed',
          error: 'Runtime error occurred',
          errorCode: 'RUNTIME_ERROR',
        });

        expect(failed.status).toBe('failed');
        expect(failed.error).toBe('Runtime error occurred');
        expect(failed.errorCode).toBe('RUNTIME_ERROR');
        expect(failed.completedAt).toBeDefined();
      });

      it('should maintain data integrity across operations', async () => {
        const originalInput = ['complex', { nested: 'data' }, 42];

        const created = await storage.steps.create(testRunId, {
          stepId: 'integrity-step',
          stepName: 'integrity-test',
          input: originalInput,
        });

        // Update status multiple times
        await storage.steps.update(testRunId, created.stepId, {
          status: 'running',
        });
        await storage.steps.update(testRunId, created.stepId, {
          status: 'completed',
        });

        const final = await storage.steps.get(testRunId, created.stepId);

        expect(final.input).toEqual(originalInput);
        expect(final.status).toBe('completed');
        expect(final.startedAt).toBeDefined();
        expect(final.completedAt).toBeDefined();
      });

      it('should handle multiple steps in same run with different statuses', async () => {
        const step1 = await storage.steps.create(testRunId, {
          stepId: 'multi-step-1',
          stepName: 'first-multi-step',
          input: ['data1'],
        });

        const step2 = await storage.steps.create(testRunId, {
          stepId: 'multi-step-2',
          stepName: 'second-multi-step',
          input: ['data2'],
        });

        // Update step1 to completed
        await storage.steps.update(testRunId, step1.stepId, {
          status: 'completed',
          output: { result1: 'success' },
        });

        // Update step2 to failed
        await storage.steps.update(testRunId, step2.stepId, {
          status: 'failed',
          error: 'Step 2 failed',
        });

        // List all steps and verify their statuses
        const allSteps = await storage.steps.list({ runId: testRunId });
        const completedStep = allSteps.data.find(
          (s) => s.stepId === 'multi-step-1'
        );
        const failedStep = allSteps.data.find(
          (s) => s.stepId === 'multi-step-2'
        );

        expect(completedStep?.status).toBe('completed');
        expect(completedStep?.output).toEqual({ result1: 'success' });
        expect(failedStep?.status).toBe('failed');
        expect(failedStep?.error).toBe('Step 2 failed');
      });
    });
  });

  describe('events', () => {
    let testRunId: string;

    beforeEach(async () => {
      // Create a test run to associate events with
      const createdRun = await storage.runs.create({
        deploymentId: 'test-deployment',
        workflowName: 'test-workflow',
        input: ['test', 'data'],
      });
      testRunId = createdRun.runId;
    });

    describe('create', () => {
      it('should create a step_completed event with all required fields', async () => {
        const createRequest = {
          eventType: 'step_completed' as const,
          correlationId: 'corr-123',
          eventData: {
            result: { success: true, data: 'processed' },
          },
        };

        const result = await storage.events.create(testRunId, createRequest);

        expect(result).toMatchObject({
          runId: testRunId,
          ...createRequest,
        });
        expect(result.eventId).toBeDefined();
        expect(result.createdAt).toBeInstanceOf(Date);
      });

      it('should create a step_failed event with error data', async () => {
        const createRequest = {
          eventType: 'step_failed' as const,
          correlationId: 'corr-456',
          eventData: {
            error: { message: 'Something went wrong', code: 'ERROR_001' },
            stack: 'Error stack trace...',
            fatal: true,
          },
        };

        const result = await storage.events.create(testRunId, createRequest);

        expect(result).toMatchObject({
          runId: testRunId,
          ...createRequest,
        });
        expect(result.eventId).toBeDefined();
        expect(result.createdAt).toBeInstanceOf(Date);
      });

      it('should create a step_started event without eventData', async () => {
        const createRequest = {
          eventType: 'step_started' as const,
          correlationId: 'corr-789',
        };

        const result = await storage.events.create(testRunId, createRequest);

        expect(result).toMatchObject({
          runId: testRunId,
          ...createRequest,
        });
        expect(result.eventId).toBeDefined();
        expect(result.createdAt).toBeInstanceOf(Date);
      });

      it('should create a webhook_created event', async () => {
        const createRequest = {
          eventType: 'webhook_created' as const,
          correlationId: 'webhook-corr-123',
        };

        const result = await storage.events.create(testRunId, createRequest);

        expect(result).toMatchObject({
          runId: testRunId,
          ...createRequest,
        });
        expect(result.eventId).toBeDefined();
        expect(result.createdAt).toBeInstanceOf(Date);
      });

      it('should create a webhook_request event with request data', async () => {
        const createRequest = {
          eventType: 'webhook_request' as const,
          correlationId: 'webhook-req-456',
          eventData: {
            request: {
              method: 'POST',
              url: 'https://example.com/webhook',
              headers: { 'Content-Type': 'application/json' },
              body: { data: 'test' },
            },
          },
        };

        const result = await storage.events.create(testRunId, createRequest);

        expect(result).toMatchObject({
          runId: testRunId,
          ...createRequest,
        });
        expect(result.eventId).toBeDefined();
        expect(result.createdAt).toBeInstanceOf(Date);
      });

      it('should create a step_retrying event with attempt data', async () => {
        const createRequest = {
          eventType: 'step_retrying' as const,
          correlationId: 'retry-corr-789',
          eventData: {
            error: { message: 'Temporary failure' },
            attempt: 2,
          },
        };

        const result = await storage.events.create(testRunId, createRequest);

        expect(result).toMatchObject({
          runId: testRunId,
          ...createRequest,
        });
        expect(result.eventId).toBeDefined();
        expect(result.createdAt).toBeInstanceOf(Date);
      });

      it('should create a workflow_started event', async () => {
        const createRequest = {
          eventType: 'workflow_started' as const,
        };

        const result = await storage.events.create(testRunId, createRequest);

        expect(result).toMatchObject({
          runId: testRunId,
          ...createRequest,
        });
        expect(result.eventId).toBeDefined();
        expect(result.createdAt).toBeInstanceOf(Date);
      });

      it('should create a workflow_completed event', async () => {
        const createRequest = {
          eventType: 'workflow_completed' as const,
        };

        const result = await storage.events.create(testRunId, createRequest);

        expect(result).toMatchObject({
          runId: testRunId,
          ...createRequest,
        });
        expect(result.eventId).toBeDefined();
        expect(result.createdAt).toBeInstanceOf(Date);
      });

      it('should create a workflow_failed event with error data', async () => {
        const createRequest = {
          eventType: 'workflow_failed' as const,
          eventData: {
            error: {
              message: 'Workflow execution failed',
              code: 'WORKFLOW_ERROR',
            },
          },
        };

        const result = await storage.events.create(testRunId, createRequest);

        expect(result).toMatchObject({
          runId: testRunId,
          ...createRequest,
        });
        expect(result.eventId).toBeDefined();
        expect(result.createdAt).toBeInstanceOf(Date);
      });

      it('should create a webhook_disposed event', async () => {
        const createRequest = {
          eventType: 'webhook_disposed' as const,
          correlationId: 'dispose-corr-123',
        };

        const result = await storage.events.create(testRunId, createRequest);

        expect(result).toMatchObject({
          runId: testRunId,
          ...createRequest,
        });
        expect(result.eventId).toBeDefined();
        expect(result.createdAt).toBeInstanceOf(Date);
      });

      it('should create multiple events for the same run', async () => {
        const event1 = await storage.events.create(testRunId, {
          eventType: 'step_started',
          correlationId: 'step-1',
        });

        const event2 = await storage.events.create(testRunId, {
          eventType: 'step_completed',
          correlationId: 'step-1',
          eventData: {
            result: { success: true },
          },
        });

        expect(event1.runId).toBe(testRunId);
        expect(event2.runId).toBe(testRunId);
        expect(event1.eventType).toBe('step_started');
        expect(event2.eventType).toBe('step_completed');
        expect(event1.eventId).not.toBe(event2.eventId);
      });

      it('should handle complex event data structures', async () => {
        const complexEventData = {
          result: {
            nested: {
              deeply: {
                value: 42,
                array: [1, 2, { mixed: 'array' }],
                nullValue: null,
                booleanValue: true,
                numberValue: 3.14,
              },
            },
          },
        };

        const createRequest = {
          eventType: 'step_completed' as const,
          correlationId: 'complex-corr',
          eventData: complexEventData,
        };

        const result = await storage.events.create(testRunId, createRequest);

        expect((result as any).eventData).toEqual(complexEventData);
      });
    });

    describe('list', () => {
      beforeEach(async () => {
        // Create multiple events for testing
        const events = [
          {
            eventType: 'workflow_started' as const,
          },
          {
            eventType: 'step_started' as const,
            correlationId: 'step-1',
          },
          {
            eventType: 'step_completed' as const,
            correlationId: 'step-1',
            eventData: {
              result: { success: true },
            },
          },
          {
            eventType: 'step_started' as const,
            correlationId: 'step-2',
          },
          {
            eventType: 'step_failed' as const,
            correlationId: 'step-2',
            eventData: {
              error: { message: 'Step failed' },
              fatal: false,
            },
          },
        ];

        for (const event of events) {
          await storage.events.create(testRunId, event);
        }
      });

      it('should list all events when no pagination is provided', async () => {
        const result = await storage.events.list({ runId: testRunId });

        expect(result.data).toHaveLength(5);
        expect(result.hasMore).toBe(false);
        expect(result.cursor).toBeNull();
        expect(result.data.map((event) => event.eventType)).toEqual([
          'workflow_started',
          'step_started',
          'step_completed',
          'step_started',
          'step_failed',
        ]);
      });

      it('should handle pagination with limit', async () => {
        const result = await storage.events.list({
          runId: testRunId,
          pagination: { limit: 3 },
        });

        expect(result.data).toHaveLength(3);
        expect(result.hasMore).toBe(true);
        expect(result.cursor).toBeDefined();
      });

      it('should handle pagination with cursor', async () => {
        const firstPage = await storage.events.list({
          runId: testRunId,
          pagination: { limit: 3 },
        });

        const secondPage = await storage.events.list({
          runId: testRunId,
          pagination: {
            limit: 3,
            cursor: firstPage.cursor!,
          },
        });

        expect(secondPage.data).toHaveLength(2);
        expect(secondPage.hasMore).toBe(false);
        expect(secondPage.cursor).toBeNull();

        // Ensure no overlap between pages
        const firstPageIds = firstPage.data.map((event) => event.eventId);
        const secondPageIds = secondPage.data.map((event) => event.eventId);
        expect(firstPageIds).not.toEqual(expect.arrayContaining(secondPageIds));
      });

      it('should return empty result when no events exist for run', async () => {
        // Create a fresh run with no events
        const freshRun = await storage.runs.create({
          deploymentId: 'fresh-deployment',
          workflowName: 'fresh-workflow',
          input: ['fresh'],
        });

        const result = await storage.events.list({ runId: freshRun.runId });

        expect(result.data).toHaveLength(0);
        expect(result.hasMore).toBe(false);
        expect(result.cursor).toBeNull();
      });

      it('should return empty result when run does not exist', async () => {
        const result = await storage.events.list({ runId: 'non-existent-run' });

        expect(result.data).toHaveLength(0);
        expect(result.hasMore).toBe(false);
        expect(result.cursor).toBeNull();
      });

      it('should maintain chronological order of events', async () => {
        const result = await storage.events.list({ runId: testRunId });

        // Events should be in the order they were created
        expect(result.data[0].eventType).toBe('workflow_started');
        expect(result.data[1].eventType).toBe('step_started');
        expect(result.data[1].correlationId).toBe('step-1');
        expect(result.data[2].eventType).toBe('step_completed');
        expect(result.data[2].correlationId).toBe('step-1');
        expect(result.data[3].eventType).toBe('step_started');
        expect(result.data[3].correlationId).toBe('step-2');
        expect(result.data[4].eventType).toBe('step_failed');
        expect(result.data[4].correlationId).toBe('step-2');
      });
    });

    describe('integration scenarios', () => {
      it('should handle complete workflow event sequence', async () => {
        // Workflow starts
        const workflowStarted = await storage.events.create(testRunId, {
          eventType: 'workflow_started',
        });

        // Step 1 starts and completes
        const step1Started = await storage.events.create(testRunId, {
          eventType: 'step_started',
          correlationId: 'step-1',
        });

        const step1Completed = await storage.events.create(testRunId, {
          eventType: 'step_completed',
          correlationId: 'step-1',
          eventData: {
            result: { processed: 'data-1' },
          },
        });

        // Step 2 starts and fails
        const step2Started = await storage.events.create(testRunId, {
          eventType: 'step_started',
          correlationId: 'step-2',
        });

        const step2Failed = await storage.events.create(testRunId, {
          eventType: 'step_failed',
          correlationId: 'step-2',
          eventData: {
            error: { message: 'Step 2 failed' },
            fatal: true,
          },
        });

        // Workflow fails
        const workflowFailed = await storage.events.create(testRunId, {
          eventType: 'workflow_failed',
          eventData: {
            error: { message: 'Workflow failed due to step 2' },
          },
        });

        // List all events and verify sequence
        const allEvents = await storage.events.list({ runId: testRunId });

        expect(allEvents.data).toHaveLength(6);
        expect(allEvents.data[0].eventType).toBe('workflow_started');
        expect(allEvents.data[1].eventType).toBe('step_started');
        expect(allEvents.data[1].correlationId).toBe('step-1');
        expect(allEvents.data[2].eventType).toBe('step_completed');
        expect(allEvents.data[2].correlationId).toBe('step-1');
        expect(allEvents.data[3].eventType).toBe('step_started');
        expect(allEvents.data[3].correlationId).toBe('step-2');
        expect(allEvents.data[4].eventType).toBe('step_failed');
        expect(allEvents.data[4].correlationId).toBe('step-2');
        expect(allEvents.data[5].eventType).toBe('workflow_failed');
      });

      it('should maintain data integrity across multiple runs', async () => {
        // Create another run
        const secondRun = await storage.runs.create({
          deploymentId: 'second-deployment',
          workflowName: 'second-workflow',
          input: ['second-data'],
        });

        // Create events for both runs
        await storage.events.create(testRunId, {
          eventType: 'workflow_started',
        });

        await storage.events.create(secondRun.runId, {
          eventType: 'workflow_started',
        });

        await storage.events.create(testRunId, {
          eventType: 'workflow_completed',
        });

        await storage.events.create(secondRun.runId, {
          eventType: 'workflow_failed',
          eventData: {
            error: { message: 'Second workflow failed' },
          },
        });

        // List events for each run separately
        const firstRunEvents = await storage.events.list({ runId: testRunId });
        const secondRunEvents = await storage.events.list({
          runId: secondRun.runId,
        });

        expect(firstRunEvents.data).toHaveLength(2);
        expect(firstRunEvents.data[0].eventType).toBe('workflow_started');
        expect(firstRunEvents.data[1].eventType).toBe('workflow_completed');
        expect(firstRunEvents.data.every((e) => e.runId === testRunId)).toBe(
          true
        );

        expect(secondRunEvents.data).toHaveLength(2);
        expect(secondRunEvents.data[0].eventType).toBe('workflow_started');
        expect(secondRunEvents.data[1].eventType).toBe('workflow_failed');
        expect(
          secondRunEvents.data.every((e) => e.runId === secondRun.runId)
        ).toBe(true);
      });
    });
  });

  describe('webhooks', () => {
    let testRunId: string;
    const testDeploymentId = 'test-deployment';

    beforeEach(async () => {
      // Create a test run to associate webhooks with
      const createdRun = await storage.runs.create({
        deploymentId: testDeploymentId,
        workflowName: 'test-workflow',
        input: ['test', 'data'],
      });
      testRunId = createdRun.runId;
    });

    describe('create', () => {
      it('should create a webhook with all required fields', async () => {
        const createRequest = {
          webhookId: 'webhook-1',
          url: 'https://example.com/webhook',
          allowedMethods: ['POST', 'GET'],
          searchParamsSchema: {
            id: { type: 'string' },
            token: { type: 'string' },
          } as any,
          headersSchema: {
            'Content-Type': { type: 'string' },
            Authorization: { type: 'string' },
          } as any,
          bodySchema: {
            type: 'object',
            properties: {
              data: { type: 'string' },
              timestamp: { type: 'number' },
            },
            required: ['data'],
          } as any,
        };

        const result = await storage.webhooks.create(testRunId, createRequest);

        expect(result).toMatchObject({
          runId: testRunId,
          ...createRequest,
        });
        expect(result.createdAt).toBeInstanceOf(Date);
        expect(result.updatedAt).toBeInstanceOf(Date);
      });

      it('should create a webhook with minimal required fields', async () => {
        const createRequest = {
          webhookId: 'webhook-minimal',
        };

        const result = await storage.webhooks.create(testRunId, createRequest);

        expect(result).toMatchObject({
          runId: testRunId,
          ownerId: 'jazz-owner',
          projectId: 'jazz-project',
          environment: 'jazz',
          allowedMethods: [],
          ...createRequest,
        });
        expect(result.url).toBeUndefined();
        expect(result.searchParamsSchema).toBeUndefined();
        expect(result.headersSchema).toBeUndefined();
        expect(result.bodySchema).toBeUndefined();
        expect(result.createdAt).toBeInstanceOf(Date);
        expect(result.updatedAt).toBeInstanceOf(Date);
      });

      it('should create a webhook with only URL and allowed methods', async () => {
        const createRequest = {
          webhookId: 'webhook-simple',
          url: 'https://api.example.com/hooks/simple',
          allowedMethods: ['POST'],
        };

        const result = await storage.webhooks.create(testRunId, createRequest);

        expect(result).toMatchObject({
          runId: testRunId,
          ...createRequest,
        });
        expect(result.searchParamsSchema).toBeUndefined();
        expect(result.headersSchema).toBeUndefined();
        expect(result.bodySchema).toBeUndefined();
      });

      it('should create multiple webhooks for the same run', async () => {
        const webhook1 = await storage.webhooks.create(testRunId, {
          webhookId: 'webhook-1',
          url: 'https://example.com/webhook1',
          allowedMethods: ['POST'],
        });

        const webhook2 = await storage.webhooks.create(testRunId, {
          webhookId: 'webhook-2',
          url: 'https://example.com/webhook2',
          allowedMethods: ['GET', 'POST'],
        });

        expect(webhook1.runId).toBe(testRunId);
        expect(webhook2.runId).toBe(testRunId);
        expect(webhook1.webhookId).toBe('webhook-1');
        expect(webhook2.webhookId).toBe('webhook-2');
        expect(webhook1.url).toBe('https://example.com/webhook1');
        expect(webhook2.url).toBe('https://example.com/webhook2');
      });

      it('should handle complex JSON schemas', async () => {
        const complexBodySchema = {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                email: { type: 'string', format: 'email' },
                preferences: {
                  type: 'object',
                  properties: {
                    notifications: { type: 'boolean' },
                    theme: { type: 'string', enum: ['light', 'dark'] },
                  },
                },
              },
              required: ['id', 'name'],
            },
            metadata: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string' },
                  value: { type: 'string' },
                },
              },
            },
          },
          required: ['user'],
        } as any;

        const createRequest = {
          webhookId: 'webhook-complex',
          url: 'https://api.example.com/webhook',
          allowedMethods: ['POST', 'PUT'],
          bodySchema: complexBodySchema,
        };

        const result = await storage.webhooks.create(testRunId, createRequest);

        expect(result.bodySchema).toEqual(complexBodySchema);
      });
    });

    describe('get', () => {
      it('should retrieve an existing webhook', async () => {
        const createRequest = {
          webhookId: 'webhook-1',
          url: 'https://example.com/webhook',
          allowedMethods: ['POST'],
        };

        const created = await storage.webhooks.create(testRunId, createRequest);
        const retrieved = await storage.webhooks.get(
          created.webhookId,
          testDeploymentId
        );

        expect(retrieved).toEqual(created);
      });

      it('should throw error when webhook does not exist', async () => {
        await expect(
          storage.webhooks.get('non-existent-webhook', testDeploymentId)
        ).rejects.toThrow();
      });

      it('should retrieve webhook with all fields populated', async () => {
        const createRequest = {
          webhookId: 'webhook-complete',
          url: 'https://api.example.com/complete',
          allowedMethods: ['GET', 'POST', 'PUT'],
          searchParamsSchema: {
            version: { type: 'string' },
            format: { type: 'string', enum: ['json', 'xml'] },
          } as any,
          headersSchema: {
            'X-API-Key': { type: 'string' },
            'X-Client-Version': { type: 'string' },
          } as any,
          bodySchema: {
            type: 'object',
            properties: {
              action: { type: 'string' },
              payload: { type: 'object' },
            },
          } as any,
        };

        const created = await storage.webhooks.create(testRunId, createRequest);
        const retrieved = await storage.webhooks.get(
          created.webhookId,
          testDeploymentId
        );

        expect(retrieved).toEqual(created);
        expect(retrieved).toMatchObject(createRequest);
      });
    });

    describe('getByUrl', () => {
      beforeEach(async () => {
        // Create multiple webhooks with different URLs for testing
        const webhooks = [
          {
            webhookId: 'webhook-url1-1',
            url: 'https://example.com/webhook',
            allowedMethods: ['POST'],
          },
          {
            webhookId: 'webhook-url1-2',
            url: 'https://example.com/webhook',
            allowedMethods: ['GET'],
          },
          {
            webhookId: 'webhook-url2-1',
            url: 'https://api.example.com/hooks',
            allowedMethods: ['POST', 'PUT'],
          },
          {
            webhookId: 'webhook-no-url',
            allowedMethods: ['POST'],
          },
        ];

        for (const webhook of webhooks) {
          await storage.webhooks.create(testRunId, webhook);
        }
      });

      it('should return webhooks matching the URL', async () => {
        const result = await storage.webhooks.getByUrl(
          'https://example.com/webhook',
          testDeploymentId
        );

        expect(result.data).toHaveLength(2);
        expect(result.hasMore).toBe(false);
        expect(result.cursor).toBeNull();
        expect(result.data.map((w) => w.webhookId)).toEqual([
          'webhook-url1-1',
          'webhook-url1-2',
        ]);
        expect(
          result.data.every((w) => w.url === 'https://example.com/webhook')
        ).toBe(true);
      });

      it('should return empty result when no webhooks match URL', async () => {
        const result = await storage.webhooks.getByUrl(
          'https://nonexistent.com/webhook',
          testDeploymentId
        );

        expect(result.data).toHaveLength(0);
        expect(result.hasMore).toBe(false);
        expect(result.cursor).toBeNull();
      });

      it('should handle pagination with limit', async () => {
        const result = await storage.webhooks.getByUrl(
          'https://example.com/webhook',
          testDeploymentId,
          { limit: 1 }
        );

        expect(result.data).toHaveLength(1);
        expect(result.hasMore).toBe(true);
        expect(result.cursor).toBeDefined();
      });

      it('should return webhooks with different URLs separately', async () => {
        const url1Result = await storage.webhooks.getByUrl(
          'https://example.com/webhook',
          testDeploymentId
        );
        const url2Result = await storage.webhooks.getByUrl(
          'https://api.example.com/hooks',
          testDeploymentId
        );

        expect(url1Result.data).toHaveLength(2);
        expect(url2Result.data).toHaveLength(1);
        expect(url1Result.data[0].url).toBe('https://example.com/webhook');
        expect(url2Result.data[0].url).toBe('https://api.example.com/hooks');
      });

      it('should not return webhooks without URLs when searching by URL', async () => {
        const result = await storage.webhooks.getByUrl(
          'https://example.com/webhook',
          testDeploymentId
        );

        expect(result.data).toHaveLength(2);
        expect(
          result.data.every((w) => w.url === 'https://example.com/webhook')
        ).toBe(true);
        expect(
          result.data.find((w) => w.webhookId === 'webhook-no-url')
        ).toBeUndefined();
      });
    });

    describe('dispose', () => {
      it('should dispose an existing webhook', async () => {
        const createRequest = {
          webhookId: 'webhook-to-dispose',
          url: 'https://example.com/webhook',
          allowedMethods: ['POST'],
        };

        const created = await storage.webhooks.create(testRunId, createRequest);
        const disposed = await storage.webhooks.dispose(
          created.webhookId,
          testDeploymentId
        );

        expect(disposed).toEqual(created);

        // Verify webhook is no longer retrievable
        await expect(
          storage.webhooks.get(created.webhookId, testDeploymentId)
        ).rejects.toThrow();
      });

      it('should throw error when trying to dispose non-existent webhook', async () => {
        await expect(
          storage.webhooks.dispose('non-existent-webhook', testDeploymentId)
        ).rejects.toThrow('Webhook non-existent-webhook not found');
      });

      it('should dispose webhook and remove it from getByUrl results', async () => {
        const webhook1 = await storage.webhooks.create(testRunId, {
          webhookId: 'webhook-dispose-1',
          url: 'https://example.com/dispose-test',
          allowedMethods: ['POST'],
        });

        const webhook2 = await storage.webhooks.create(testRunId, {
          webhookId: 'webhook-dispose-2',
          url: 'https://example.com/dispose-test',
          allowedMethods: ['GET'],
        });

        // Verify both webhooks exist
        const beforeDispose = await storage.webhooks.getByUrl(
          'https://example.com/dispose-test',
          testDeploymentId
        );
        expect(beforeDispose.data).toHaveLength(2);

        // Dispose one webhook
        await storage.webhooks.dispose(webhook1.webhookId, testDeploymentId);

        // Verify only one webhook remains
        const afterDispose = await storage.webhooks.getByUrl(
          'https://example.com/dispose-test',
          testDeploymentId
        );
        expect(afterDispose.data).toHaveLength(1);
        expect(afterDispose.data[0].webhookId).toBe('webhook-dispose-2');
      });
    });

    describe('integration scenarios', () => {
      it('should handle complete webhook lifecycle', async () => {
        // Create webhook
        const created = await storage.webhooks.create(testRunId, {
          webhookId: 'lifecycle-webhook',
          url: 'https://api.example.com/lifecycle',
          allowedMethods: ['POST'],
          bodySchema: {
            type: 'object',
            properties: {
              event: { type: 'string' },
              data: { type: 'object' },
            },
          },
        });

        expect(created.webhookId).toBe('lifecycle-webhook');
        expect(created.url).toBe('https://api.example.com/lifecycle');

        // Retrieve webhook
        const retrieved = await storage.webhooks.get(
          created.webhookId,
          testDeploymentId
        );
        expect(retrieved).toEqual(created);

        // Find webhook by URL
        const byUrl = await storage.webhooks.getByUrl(
          'https://api.example.com/lifecycle',
          testDeploymentId
        );
        expect(byUrl.data).toHaveLength(1);
        expect(byUrl.data[0].webhookId).toBe('lifecycle-webhook');

        // Dispose webhook
        const disposed = await storage.webhooks.dispose(
          created.webhookId,
          testDeploymentId
        );
        expect(disposed.webhookId).toBe('lifecycle-webhook');

        // Verify webhook is gone
        await expect(
          storage.webhooks.get(created.webhookId, testDeploymentId)
        ).rejects.toThrow();
      });

      it('should maintain data integrity across multiple runs', async () => {
        // Create another run
        const secondRun = await storage.runs.create({
          deploymentId: 'second-deployment',
          workflowName: 'second-workflow',
          input: ['second-data'],
        });

        // Create webhooks for both runs
        const webhook1 = await storage.webhooks.create(testRunId, {
          webhookId: 'run1-webhook',
          url: 'https://api.example.com/run1',
          allowedMethods: ['POST'],
        });

        const webhook2 = await storage.webhooks.create(secondRun.runId, {
          webhookId: 'run2-webhook',
          url: 'https://api.example.com/run2',
          allowedMethods: ['GET'],
        });

        // Verify webhooks are isolated by run
        expect(webhook1.runId).toBe(testRunId);
        expect(webhook2.runId).toBe(secondRun.runId);

        // Verify webhooks can be retrieved independently
        const retrieved1 = await storage.webhooks.get(
          'run1-webhook',
          testDeploymentId
        );
        const retrieved2 = await storage.webhooks.get(
          'run2-webhook',
          'second-deployment'
        );

        expect(retrieved1.runId).toBe(testRunId);
        expect(retrieved2.runId).toBe(secondRun.runId);

        // Verify getByUrl works independently
        const url1Results = await storage.webhooks.getByUrl(
          'https://api.example.com/run1',
          testDeploymentId
        );
        const url2Results = await storage.webhooks.getByUrl(
          'https://api.example.com/run2',
          'second-deployment'
        );

        expect(url1Results.data).toHaveLength(1);
        expect(url1Results.data[0].webhookId).toBe('run1-webhook');
        expect(url2Results.data).toHaveLength(1);
        expect(url2Results.data[0].webhookId).toBe('run2-webhook');
      });
    });
  });
});
