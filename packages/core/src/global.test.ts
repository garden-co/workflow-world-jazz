import { describe, expect, it } from 'vitest';
import {
  FatalError,
  type StepInvocationQueueItem,
  WorkflowSuspension,
} from './global.js';

describe('FatalError', () => {
  it('should create a FatalError instance', () => {
    const error = new FatalError('Test fatal error');

    expect(error).toBeInstanceOf(FatalError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Test fatal error');
    expect(error.name).toBe('FatalError');
  });

  it('should have correct prototype chain', () => {
    const error = new FatalError('Test error');

    expect(error instanceof Error).toBe(true);
    expect(error instanceof FatalError).toBe(true);
    expect(error.constructor).toBe(FatalError);
  });

  it('should have stack trace', () => {
    const error = new FatalError('Test error');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('FatalError');
    expect(error.stack).toContain('Test error');
  });
});

describe('WorkflowSuspension', () => {
  it('should create a WorkflowSuspension instance with basic properties', () => {
    const steps: InvocationQueueItem[] = [
      {
        stepName: 'test-step',
        args: ['arg1', 'arg2'],
        invocationId: 'inv-1',
      },
    ];
    const error = new WorkflowSuspension(steps);

    expect(error).toBeInstanceOf(WorkflowSuspension);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('WorkflowSuspension');
    expect(error.steps).toEqual(steps);
  });

  it('should generate correct error message for single step', () => {
    const steps: StepInvocationQueueItem[] = [
      {
        type: 'step',
        stepName: 'test-step',
        args: ['arg1', 42, { key: 'value' }],
        invocationId: 'inv-1',
      },
    ];
    const error = new WorkflowSuspension(steps);

    expect(error.message).toBe('1 steps have not been run yet');
  });

  it('should generate correct error message for multiple steps', () => {
    const steps: StepInvocationQueueItem[] = [
      {
        type: 'step',
        stepName: '__wkf_step_1',
        args: ['arg1'],
        invocationId: 'inv-1',
      },
      {
        type: 'step',
        stepName: '__wkf_step_2',
        args: ['arg2'],
        invocationId: 'inv-2',
      },
    ];
    const error = new WorkflowSuspension(steps);

    expect(error.message).toBe('2 steps have not been run yet');
  });

  it('should handle empty steps array', () => {
    const steps: StepInvocationQueueItem[] = [];
    const error = new WorkflowSuspension(steps);

    expect(error.steps).toEqual([]);
    expect(error.message).toBe('0 steps have not been run yet');
  });

  it('should handle complex step configurations', () => {
    const complexSteps: StepInvocationQueueItem[] = [
      {
        type: 'step',
        stepName: 'complex-step',
        args: [
          'string',
          123,
          true,
          { nested: { object: 'value' } },
          [1, 2, 3],
          null,
        ],
        invocationId: 'complex-inv',
      },
      {
        type: 'step',
        stepName: 'another-step',
        args: [],
        invocationId: 'another-inv',
      },
    ];
    const error = new WorkflowSuspension(complexSteps);

    expect(error.steps).toEqual(complexSteps);
    expect(error.message).toBe('2 steps have not been run yet');
    expect(error.steps[0].stepName).toBe('complex-step');
    expect((error.steps[0] as StepInvocationQueueItem).invocationId).toBe(
      'complex-inv'
    );
    expect(error.steps[1].stepName).toBe('another-step');
    expect((error.steps[1] as StepInvocationQueueItem).invocationId).toBe(
      'another-inv'
    );
  });

  it('should have correct prototype chain', () => {
    const steps: StepInvocationQueueItem[] = [
      {
        type: 'step',
        stepName: 'test-step',
        args: [],
        invocationId: 'inv-1',
      },
    ];
    const error = new WorkflowSuspension(steps);

    expect(error instanceof Error).toBe(true);
    expect(error instanceof WorkflowSuspension).toBe(true);
    expect(error.constructor).toBe(WorkflowSuspension);
  });

  it('should have stack trace', () => {
    const steps: StepInvocationQueueItem[] = [
      {
        type: 'step',
        stepName: 'test-step',
        args: ['arg'],
        invocationId: 'inv-1',
      },
    ];
    const error = new WorkflowSuspension(steps);

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('WorkflowSuspension');
  });

  it('should preserve all step information', () => {
    const steps: StepInvocationQueueItem[] = [
      {
        type: 'step',
        stepName: 'database-query',
        args: ['SELECT * FROM users', { limit: 10 }],
        invocationId: 'db-query-123',
      },
      {
        type: 'step',
        stepName: 'send-email',
        args: ['user@example.com', 'Welcome!'],
        invocationId: 'email-456',
      },
    ];
    const error = new WorkflowSuspension(steps);

    expect(error.steps).toHaveLength(2);
    expect(error.steps[0].stepName).toBe('database-query');
    expect((error.steps[0] as StepInvocationQueueItem).args).toEqual([
      'SELECT * FROM users',
      { limit: 10 },
    ]);
    expect((error.steps[0] as StepInvocationQueueItem).invocationId).toBe(
      'db-query-123'
    );
    expect(error.steps[1].stepName).toBe('send-email');
    expect((error.steps[1] as StepInvocationQueueItem).args).toEqual([
      'user@example.com',
      'Welcome!',
    ]);
    expect((error.steps[1] as StepInvocationQueueItem).invocationId).toBe(
      'email-456'
    );
  });
});
