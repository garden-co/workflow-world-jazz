import { startWorker } from 'jazz-tools/worker';
import type { AuthProvider, World } from '../world/interfaces.js';
import { createStorage } from './storage.js';
import { JazzStorageAccount } from './types.js';

interface JazzWorld extends World {
  done(): Promise<void>;
}

export function createJazzWorld(): JazzWorld {
  // TODO: this will become simpler once createJazzWorld can be async
  const workerPromise = (async () => {
    const { worker } = await startWorker({
      // syncServer: `wss://cloud.jazz.tools/?key=${process.env.JAZZ_API_KEY}`,
      syncServer: 'http://localhost:4201',
      AccountSchema: JazzStorageAccount,
    });

    await worker.$jazz.ensureLoaded({
      resolve: {
        root: {
          runs: true,
        },
      },
    });

    return worker;
  })();

  return {
    ...authImpl,
    ...createStorage(workerPromise),
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
