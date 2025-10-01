import { createJazzTestAccount } from 'jazz-tools/testing';
import type { JazzStorageAccountResolver } from './types.js';
import { JazzStorageAccount } from './types.js';

export function createJazzTestAccountResolver(): JazzStorageAccountResolver {
  const workerPromise = createJazzTestAccount({
    isCurrentActiveAccount: true,
    AccountSchema: JazzStorageAccount,
  });

  const ensureLoaded: JazzStorageAccountResolver = async (resolve) => {
    const worker = await workerPromise;
    return worker.$jazz.ensureLoaded({ resolve });
  };

  return ensureLoaded;
}
