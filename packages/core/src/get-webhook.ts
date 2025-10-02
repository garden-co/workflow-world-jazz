import type { JSONSchema7 } from 'json-schema';
import type { ZodType } from 'zod';

export interface Webhook {
  /**
   * The URL that external systems can call to send data to the workflow.
   */
  url: string;
  then: Promise<Request>['then'];
  [Symbol.asyncIterator](): AsyncIterableIterator<Request>;
}

export type Method =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'PATCH'
  | 'OPTIONS'
  | 'HEAD';

export type WebhookSchema =
  | ZodType
  | JSONSchema7
  | { toJSONSchema: () => JSONSchema7 };

export interface WebhookOptions {
  /**
   * The URL pathname to which the webhook will be sent.
   *
   * If not provided, the webhook will use an ephemerally generated URL.
   *
   * @example
   *
   * ```ts
   * const webhook = getWebhook({
   *   url: '/api/github/webhook',
   * });
   * ```
   */
  url?: string;

  /**
   * The HTTP method (or methods) that are allowed to be used to trigger the webhook.
   *
   * By default, only `POST` is allowed.
   */
  method?: Method | Method[];

  /**
   * An object with the keys being the header names and the values being
   * the schema to validate the request header values.
   *
   * By default, the headers are not validated.
   *
   * @example
   *
   * ```ts
   * const webhook = getWebhook({
   *   headers: {
   *     'X-Api-Key': z.literal('123'),
   *   },
   * });
   * ```
   */
  headers?: Record<string, WebhookSchema>;

  /**
   * An object with the keys being the search parameter names and the values being
   * the schema to validate the request search parameter values.
   *
   * By default, the search parameters are not validated.
   *
   * @example
   *
   * ```ts
   * const webhook = getWebhook({
   *   searchParams: {
   *     approve: z.enum(['yes', 'no']),
   *   },
   * });
   */
  searchParams?: Record<string, WebhookSchema>;

  /**
   * The schema to validate the request body of the webhook.
   *
   * The body **must** be a JSON payload. Any other content type
   * will cause the webhook request to fail validation.
   *
   * By default, the body is not validated.
   *
   * @example
   *
   * ```ts
   * const webhook = getWebhook({
   *   body: z.object({
   *     name: z.literal('John'),
   *   }),
   * });
   * ```
   */
  body?: WebhookSchema;
}

/**
 * Registers a webhook URL that can be provided to external systems
 * outside of the workflow run (such as sending in an email for
 * human-in-the-loop workflows).
 *
 * @param options - Configuration options for the webhook.
 * @returns A `Webhook` that can awaited on to receive one or more `Request` instances.
 */
export function getWebhook(options?: WebhookOptions): Webhook {
  void options;
  throw new Error('Webhooks are not supported outside of workflow functions');
}
