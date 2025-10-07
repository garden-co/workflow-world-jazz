import { getWorld } from '@vercel/workflow-core';
import chalk from 'chalk';
import { logger, setJsonMode, setVerboseMode } from '../config/log.js';
import {
  inferEmbeddedWorldEnvVars,
  inferVercelEnvVars,
  writeEnvVars,
} from './env.js';

export const setupCliWorld = async (
  flags: {
    json: boolean;
    verbose: boolean;
    backend: string;
    env: string;
    authToken: string;
    project: string;
    team: string;
  },
  version: string
) => {
  setJsonMode(Boolean(flags.json));
  setVerboseMode(Boolean(flags.verbose));

  logger.showBox(
    'green',
    `        Workflow CLI v${version}        `,
    'Docs at https://workflow-docs.vercel.sh/',
    chalk.yellow('This is an alpha release - commands might change')
  );

  logger.debug('Inferring env vars');
  writeEnvVars({
    DEBUG: flags.verbose ? '1' : '',
    WORKFLOW_TARGET_WORLD: flags.backend,
    WORKFLOW_VERCEL_ENV: flags.env,
    WORKFLOW_VERCEL_AUTH_TOKEN: flags.authToken,
    WORKFLOW_VERCEL_PROJECT_ID: flags.project,
    WORKFLOW_VERCEL_TEAM_ID: flags.team,
    WORKFLOW_VERCEL_PROXY_URL: 'https://api.vercel.com/v1/workflow',
  });
  process.env.DEBUG = flags.verbose ? '1' : '0';

  if (flags.backend === 'vercel') {
    await inferVercelEnvVars();
  } else {
    await inferEmbeddedWorldEnvVars();
  }

  logger.debug('Initializing world');
  const world = getWorld();

  return world;
};
