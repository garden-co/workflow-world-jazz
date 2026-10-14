import { globalSingleton } from '@workflow/utils';
import { mintedSpecVersion, type World } from '@workflow/world';
import { startWorker } from 'jazz-tools/worker';
import { type Config, loadConfig } from './config.js';
import { Engine } from './engine.js';
import { createQueue } from './queue.js';
import { createStorage } from './storage.js';
import { createStreamer } from './streamer.js';
import { JazzStorageAccount, type JazzWorldRoot } from './types.js';

/**
 * Process-wide, not module-wide: a bundler can compile this module into
 * several layers of one server, and each layer must reach the same worker and
 * the same in-process slot allocation, or two layers would race for one run's
 * slots.
 */
const state = globalSingleton('workflow-world-jazz//worlds', 1, () => ({
  worlds: new Map<string, World>(),
}));

export function createWorld(port?: number): World {
  const config = loadConfig(port);
  const key = `${config.syncServer} ${process.env.JAZZ_WORKER_ACCOUNT} ${config.webhookEndpoint}`;
  let world = state.worlds.get(key);
  if (!world) {
    world = buildWorld(config);
    state.worlds.set(key, world);
  }
  return world;
}

function buildWorld(config: Config): World {
  return createWorldForAccount(
    startWorker({
      syncServer: config.syncServer,
      AccountSchema: JazzStorageAccount,
    }),
    config
  );
}

/**
 * Builds the World on an already-started Jazz account. `createWorld()` uses a
 * worker account; tests pass an in-memory one.
 */
export function createWorldForAccount(
  started: Promise<{
    worker: JazzStorageAccount;
    shutdownWorker?: () => Promise<void>;
  }>,
  config: Pick<Config, 'webhookEndpoint' | 'webhookRegistryId'>
): World {
  let root: Promise<JazzWorldRoot> | undefined;
  const loadRoot = () => {
    root ??= started
      .then(({ worker }) =>
        worker.$jazz.ensureLoaded({
          resolve: {
            root: {
              workflowV5: {
                runs: true,
                hookTokens: true,
                hookRuns: true,
                queues: true,
              },
            },
          },
        })
      )
      .then((account) => account.root.workflowV5 as JazzWorldRoot);
    root.catch(() => {
      root = undefined;
    });
    return root;
  };

  // A write is acknowledged only once the sync server has it, the closest
  // Jazz comes to a commit.
  const sync = async () => {
    const { worker } = await started;
    await worker.$jazz.waitForAllCoValuesSync();
  };

  const engine = new Engine({ root: loadRoot, sync });

  return {
    // Read on every createWorld() call, so WORKFLOW_SEALED_LOG=0 is honored.
    specVersion: mintedSpecVersion(),
    ...createQueue(
      { root: loadRoot, sync },
      config.webhookEndpoint,
      config.webhookRegistryId
    ),
    ...createStorage(engine),
    ...createStreamer(engine, sync),
    async start() {
      await loadRoot();
    },
    async close() {
      const { shutdownWorker } = await started;
      await shutdownWorker?.();
      for (const [key, world] of state.worlds) {
        if (world === this) state.worlds.delete(key);
      }
    },
  };
}
