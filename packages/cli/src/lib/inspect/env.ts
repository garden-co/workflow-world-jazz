import { access } from 'node:fs/promises';
import { logger } from '../config/log.js';
import { getWorkflowConfig } from '../config/workflow-config.js';
import { getAuth } from './auth.js';
import {
  getProjectLink,
  isOneOfErrNoExceptions,
  type ProjectLink,
} from './vercel-link.js';

/**
 * Overwrite values on process.env with the given values (if not undefined)
 *
 * We do this because the core world init code reads from environment
 * (or workflow.config.ts soon) on first invocations, so CLI needs to
 * overwrite the values.
 */
export const writeEnvVars = (envVars: Record<string, string>) => {
  Object.entries(envVars).forEach(([key, value]) => {
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      value === 'undefined'
    ) {
      return;
    }
    process.env[key] = value;
  });
};

export const getEnvVars = (): Record<string, string> => {
  const env = process.env;
  return {
    WORKFLOW_TARGET_WORLD: env.WORKFLOW_TARGET_WORLD || '',
    WORKFLOW_VERCEL_ENV: env.WORKFLOW_VERCEL_ENV || '',
    WORKFLOW_VERCEL_AUTH_TOKEN: env.WORKFLOW_VERCEL_AUTH_TOKEN || '',
    WORKFLOW_VERCEL_PROJECT_ID: env.WORKFLOW_VERCEL_PROJECT_ID || '',
    WORKFLOW_VERCEL_TEAM_ID: env.WORKFLOW_VERCEL_TEAM_ID || '',
    WORKFLOW_VERCEL_PROXY_URL: env.WORKFLOW_VERCEL_PROXY_URL || '',
    PORT: env.PORT || '',
    WORKFLOW_EMBEDDED_DATA_DIR: env.WORKFLOW_EMBEDDED_DATA_DIR || '',
  };
};

/**
 * Overwrites process.env variables related to embedded world configuration,
 * if relevant environment variables aren't set already.
 */
export const inferEmbeddedWorldEnvVars = async () => {
  const envVars = getEnvVars();
  if (!envVars.PORT) {
    logger.warn(
      'PORT environment variable is not set, using default port 3000'
    );
    envVars.PORT = '3000';
    writeEnvVars(envVars);
  }
  // Paths to check, in order of preference
  if (!envVars.WORKFLOW_EMBEDDED_DATA_DIR) {
    // TODO: Find these relative to repository root, using findRepoRoot?
    // Unclear, since the workflow data dir might be in a sub-project
    const paths = ['.next/workflow-data', '.workflow-data', 'workflow-data'];
    for (const path of paths) {
      if (
        await access(path)
          .then(() => true)
          .catch(() => false)
      ) {
        logger.debug('Found workflow data directory:', path);
        envVars.WORKFLOW_EMBEDDED_DATA_DIR = path;
        writeEnvVars(envVars);
        break;
      }
    }
    if (!envVars.WORKFLOW_EMBEDDED_DATA_DIR) {
      logger.error(
        'No workflow data directory found. Have you run any workflows yet?'
      );
      logger.warn(
        `\nCheck whether your data is in any of:\n${paths.join('\n')}\n\n`
      );
      throw new Error('No workflow data directory found');
    }
  }
};

export const inferVercelProjectAndTeam = async () => {
  const cwd = getWorkflowConfig().workingDir;
  let project: ProjectLink | null = null;
  try {
    logger.debug(`Inferring project and team from CWD: ${cwd}`);
    project = await getProjectLink(cwd);
  } catch (error) {
    if (!isOneOfErrNoExceptions(error, ['ENOENT'])) {
      throw error;
    }
  }
  if (!project) {
    logger.debug('Could not find project link folder');
    return;
  }
  logger.debug(`Found project ${project.projectId} and team ${project.orgId}`);
  return {
    projectId: project.projectId,
    teamId: project.orgId,
  };
};

/**
 * Overwrites process.env variables related to Vercel World configuration,
 * if relevant environment variables aren't set already.
 */
export const inferVercelEnvVars = async () => {
  const envVars = getEnvVars();

  if (!envVars.WORKFLOW_VERCEL_PROJECT_ID || !envVars.WORKFLOW_VERCEL_TEAM_ID) {
    logger.debug('Inferring vercel project and team from .vercel folder');
    const inferredProject = await inferVercelProjectAndTeam();
    if (inferredProject) {
      const { projectId, teamId } = inferredProject;
      envVars.WORKFLOW_VERCEL_PROJECT_ID = projectId;
      envVars.WORKFLOW_VERCEL_TEAM_ID = teamId;
      writeEnvVars(envVars);
    } else {
      logger.warn(
        'Could not infer vercel project and team from .vercel folder, server authentication might fail.'
      );
    }
  }

  if (!envVars.WORKFLOW_VERCEL_AUTH_TOKEN) {
    logger.debug('Inferring vercel auth token from CLI auth file');
    const auth = getAuth();
    if (!auth) {
      throw new Error('Could not find credentials. Run `vc login` to log in.');
    }
    envVars.WORKFLOW_VERCEL_AUTH_TOKEN = auth.token;
    writeEnvVars(envVars);
  }
};
