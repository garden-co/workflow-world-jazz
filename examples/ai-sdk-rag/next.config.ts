import { withWorkflow } from '@vercel/workflow-next';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ['nanoid'],
};

// export default nextConfig;
export default withWorkflow(nextConfig);
