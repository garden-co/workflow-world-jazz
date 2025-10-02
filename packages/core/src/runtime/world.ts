import type { World } from '@vercel/workflow-world';
import { createEmbeddedWorld } from '@vercel/workflow-world-embedded';
import {
  type APIConfig,
  createVercelWorld,
} from '@vercel/workflow-world-vercel';

let world: World | undefined;

const initWorld = () => {
  const targetWorld = process.env.WORKFLOW_TARGET_WORLD || 'vercel';

  if (targetWorld === 'vercel') {
    const headers: Record<string, string> = {};
    const config: APIConfig = { headers };
    const env = process.env.WORKFLOW_VERCEL_ENV;
    const authToken = process.env.WORKFLOW_VERCEL_AUTH_TOKEN;
    const projectId = process.env.WORKFLOW_VERCEL_PROJECT_ID;
    const teamId = process.env.WORKFLOW_VERCEL_TEAM_ID;
    const proxyUrl = process.env.WORKFLOW_VERCEL_PROXY_URL;
    if (authToken) {
      config.token = authToken;
    }
    if (env) {
      headers['x-vercel-environment'] = env;
    }
    if (projectId) {
      headers['x-vercel-project-id'] = projectId;
    }
    if (teamId) {
      headers['x-vercel-team-id'] = teamId;
    }
    if (proxyUrl) {
      config.baseUrl = proxyUrl;
    }
    return createVercelWorld(config);
  }

  if (targetWorld !== 'embedded') {
    console.error(
      `Invalid target world: ${targetWorld}, using embedded world instead.`
    );
  }

  const dataDir = process.env.WORKFLOW_EMBEDDED_DATA_DIR;
  const port = process.env.PORT ? Number(process.env.PORT) : undefined;
  return createEmbeddedWorld(dataDir, port);
};

/**
 * Some functions from the world are needed at build time, but we do NOT want
 * to cache the world in those instances, since we don't have the correct
 * environment variables set yet. This is a safe function to call at build time,
 * that only gives access to non-environment-bound world functions.
 */
export const getWorldHandlers = (): Pick<World, 'createQueueHandler'> => {
  const _world = initWorld();
  return {
    createQueueHandler: _world.createQueueHandler,
  };
};

export const getWorld = (): World => {
  if (world) {
    return world;
  }
  world = initWorld();
  return world;
};
