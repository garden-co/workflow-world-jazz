import type { World } from '@vercel/workflow-world';
import { createAuth } from './auth.js';
import { createQueue } from './queue.js';
import { createStorage } from './storage.js';
import { createStreamer } from './streamer.js';
import type { APIConfig } from './utils.js';

export { WorkflowAPIError } from './errors.js';
export { createQueue } from './queue.js';
export { createStorage } from './storage.js';
export { createStreamer } from './streamer.js';
export type { APIConfig } from './utils.js';
export { DEFAULT_CONFIG } from './utils.js';

export function createVercelWorld(config?: APIConfig): World {
  return {
    ...createQueue(),
    ...createStorage(config),
    ...createAuth(config),
    ...createStreamer(config),
  };
}
