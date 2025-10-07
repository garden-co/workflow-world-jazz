import type { AuthProvider, World } from '@vercel/workflow-world';
import { startWorker } from 'jazz-tools/worker';
import { config } from './config.js';
import { createQueue } from './queue.js';
import { createStorage } from './storage.js';
import { createStreamer } from './streamer.js';
import {
  JazzStorageAccount,
  type JazzStorageAccountResolver,
} from './types.js';

let world: World | undefined;

export function createJazzWorld(port?: number): World {
  if (world) {
    return world;
  }

  const workerPromise = (async () => {
    const { worker } = await startWorker({
      syncServer: `wss://cloud.jazz.tools/?key=${process.env.JAZZ_API_KEY}`,
      AccountSchema: JazzStorageAccount,
    });
    return worker;
  })();

  const ensureLoaded: JazzStorageAccountResolver = async (resolve) => {
    const worker = await workerPromise;
    return worker.$jazz.ensureLoaded({ resolve });
  };

  world = {
    ...authImpl,
    ...createQueue(ensureLoaded, port ?? config.port),
    ...createStorage(ensureLoaded),
    ...createStreamer(ensureLoaded),
  };
  return world;
}

const authImpl: AuthProvider = {
  getAuthInfo: async () => {
    return {
      ownerId: 'jazz-owner',
      projectId: 'jazz-project',
      environment: 'jazz',
      userId: 'jazz-user',
    };
  },

  checkHealth: async () => {
    return {
      success: true,
      data: { healthy: true },
      message: 'Jazz backend is healthy',
    };
  },
};
