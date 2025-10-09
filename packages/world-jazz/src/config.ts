export type Config = {
  syncServer: string;
  webhookEndpoint: string;
  webhookRegistryId: string;
};

const getPortFromEnv = () => {
  const port = process.env.PORT;
  if (port) {
    return Number(port);
  }
  return 3000;
};

export function loadConfig(port?: number): Config {
  let syncServer = process.env.JAZZ_SYNC_SERVER;
  if (!syncServer) {
    if (!process.env.JAZZ_API_KEY) {
      throw new Error('JAZZ_API_KEY is not set');
    }
    syncServer = `wss://cloud.jazz.tools/?key=${process.env.JAZZ_API_KEY}`;
  }

  let webhookEndpoint = process.env.JAZZ_WEBHOOK_ENDPOINT;
  if (!webhookEndpoint) {
    webhookEndpoint = `http://localhost:${port ?? getPortFromEnv()}`;
  }

  // These are required for the webhook registry
  if (!process.env.JAZZ_WORKER_ACCOUNT) {
    throw new Error('JAZZ_WORKER_ACCOUNT is not set');
  }
  if (!process.env.JAZZ_WORKER_SECRET) {
    throw new Error('JAZZ_WORKER_SECRET is not set');
  }

  const webhookRegistryId = process.env.JAZZ_WEBHOOK_REGISTRY_ID;
  if (!webhookRegistryId) {
    throw new Error('JAZZ_WEBHOOK_REGISTRY_ID is not set');
  }

  return { syncServer, webhookEndpoint, webhookRegistryId };
}
