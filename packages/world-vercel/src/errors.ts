export class WorkflowAPIError extends Error {
  status?: number;
  code?: string;
  url?: string;
  readonly cause?: unknown;

  constructor(
    message: string,
    {
      status,
      code,
      url,
      cause,
    }: { status?: number; url?: string; code?: string; cause?: unknown } = {}
  ) {
    super(message, { cause });
    this.name = 'WorkflowAPIError';
    this.status = status;
    this.code = code;
    this.url = url;

    if (cause instanceof Error) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }

  /**
   * Type guard to check if an error is a WorkflowAPIError.
   */
  static is(error: any): error is WorkflowAPIError {
    return error instanceof WorkflowAPIError;
  }
}
