import { beforeEach, describe, expect, it } from 'vitest';
import { createJazzTestAccount } from 'jazz-tools/testing';
import { JazzStorageAccount } from './types.js';
import { createStorage } from './storage.js';
import { Storage } from '../world/interfaces.js';
import { WorkflowRun } from '../world/runs.js';
import { Step } from '../world/steps.js';

describe('JazzStorage', () => {
  let storage: Storage;

  beforeEach(async () => {
    const workerPromise = createJazzTestAccount({
      isCurrentActiveAccount: true,
      AccountSchema: JazzStorageAccount,
    });
    storage = createStorage(workerPromise);
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
          deploymentId: 'test-deployment',
          workflowName: 'test-workflow',
          status: 'pending',
          input: ['arg1', 'arg2', { nested: 'object' }],
          executionContext: { userId: 'user123', environment: 'test' },
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
          deploymentId: 'test-deployment',
          workflowName: 'test-workflow',
          status: 'pending',
          input: ['simple', 'args'],
          executionContext: undefined,
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
        const freshWorkerPromise = createJazzTestAccount({
          isCurrentActiveAccount: true,
          AccountSchema: JazzStorageAccount,
        });
        const freshStorage = createStorage(freshWorkerPromise);

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
          stepId: 'step-1',
          stepName: 'test-step',
          status: 'pending',
          input: ['arg1', 'arg2', { nested: 'object' }],
          attempt: 1,
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
});
