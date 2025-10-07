import {
  type CreateWebhookRequest,
  type ListWebhooksByUrlParams,
  type PaginatedResponse,
  PaginatedResponseSchema,
  type Webhook,
  WebhookSchema,
} from '@vercel/workflow-world';
import type { APIConfig } from './utils.js';
import { dateToStringReplacer, makeRequest } from './utils.js';

// Functions
export async function createWebhook(
  runId: string,
  data: CreateWebhookRequest,
  config?: APIConfig
): Promise<Webhook> {
  return makeRequest({
    endpoint: '/webhooks/create',
    options: {
      method: 'POST',
      body: JSON.stringify({ ...data, runId }, dateToStringReplacer),
    },
    config,
    schema: WebhookSchema,
  });
}

export async function getWebhook(
  webhookId: string,
  deploymentId: string,
  config?: APIConfig
): Promise<Webhook> {
  return makeRequest({
    endpoint: `/webhooks/${webhookId}?deploymentId=${deploymentId}`,
    options: { method: 'GET' },
    config,
    schema: WebhookSchema,
  });
}

export async function disposeWebhook(
  webhookId: string,
  deploymentId: string,
  config?: APIConfig
): Promise<Webhook> {
  return makeRequest({
    endpoint: `/webhooks/${webhookId}?deploymentId=${deploymentId}`,
    options: { method: 'DELETE' },
    config,
    schema: WebhookSchema,
  });
}

export async function getWebhooksByUrl(
  url: string,
  deploymentId: string,
  params: ListWebhooksByUrlParams = {},
  config?: APIConfig
): Promise<PaginatedResponse<Webhook>> {
  const searchParams = new URLSearchParams();
  searchParams.set('url', url);
  searchParams.set('deploymentId', deploymentId);

  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());

  const queryString = searchParams.toString();
  const endpoint = `/webhooks/by-url?${queryString}`;

  return makeRequest({
    endpoint,
    options: { method: 'GET' },
    config,
    schema: PaginatedResponseSchema(WebhookSchema),
  });
}
