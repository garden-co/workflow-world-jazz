import { getVercelOidcToken } from '@vercel/oidc';
import type { z } from 'zod';
import { WorkflowAPIError } from './errors.js';

export interface APIConfig {
  baseUrl?: string;
  token?: string;
  headers?: RequestInit['headers'];
}

export function dateToStringReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

export const DEFAULT_CONFIG: APIConfig = {
  baseUrl: 'https://workflow-server.vercel.sh/api',
  headers: {
    'Content-Type': 'application/json',
  },
};

export async function makeRequest<T>({
  endpoint,
  options = {},
  config = {},
  schema,
}: {
  endpoint: string;
  options?: RequestInit;
  config?: APIConfig;
  schema: z.ZodSchema<T>;
}): Promise<T> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const url = `${finalConfig.baseUrl}${endpoint}`;

  const headers = new Headers({
    ...finalConfig.headers,
    ...options.headers,
  });

  const token = finalConfig.token ?? (await getVercelOidcToken());
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as any;
    if (process.env.DEBUG === '1') {
      const stringifiedHeaders = Array.from(headers.entries())
        .map(([key, value]: [string, string]) => `-H "${key}: ${value}"`)
        .join(' ');
      console.error(
        `Failed to fetch, reproduce with:\ncurl -X ${options.method} ${stringifiedHeaders} "${url}"`
      );
    }
    throw new WorkflowAPIError(
      errorData.message ||
        `${options.method ?? 'GET'} ${endpoint} -> HTTP ${response.status}: ${response.statusText}`,
      { url, status: response.status, code: errorData.code }
    );
  }

  try {
    const text = await response.text();
    return schema.parse(JSON.parse(text));
  } catch (error) {
    throw new WorkflowAPIError(
      `Failed to parse server response for ${options.method ?? 'GET'} ${endpoint}`,
      { url, cause: error }
    );
  }
}
