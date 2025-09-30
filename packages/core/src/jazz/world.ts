import { startWorker } from 'jazz-tools/worker';
import type { AuthProvider, Storage, Streamer } from '../world/interfaces.js';
import { createStorage } from './storage.js';
import { createStreamer } from './streamer.js';
import { JazzStorageAccount } from './types.js';

// interface JazzWorld extends World {
interface JazzWorld extends Storage, Streamer {
  done(): Promise<void>;
}

export function createJazzWorld(): JazzWorld {
  const workerPromise = (async () => {
    const { worker } = await startWorker({
      // syncServer: `wss://cloud.jazz.tools/?key=${process.env.JAZZ_API_KEY}`,
      syncServer: 'http://localhost:4201',
      AccountSchema: JazzStorageAccount,
    });
    return worker;
  })();

  const rootPromise = (async () => {
    const worker = await workerPromise;
    return (
      await worker.$jazz.ensureLoaded({
        resolve: {
          root: true,
        },
      })
    ).root;
  })();

  return {
    ...authImpl,
    ...createStorage(rootPromise),
    ...createStreamer(rootPromise),
    done: async () => {
      const worker = await workerPromise;
      await worker.$jazz.waitForAllCoValuesSync();
    },
  };
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
