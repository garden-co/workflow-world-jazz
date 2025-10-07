import { withWorkflow } from '@vercel/workflow-next';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ['@node-rs/xxhash'],
  // for easier debugging
  experimental: {
    serverMinification: false,
  },
};

// export default nextConfig;
export default withWorkflow(nextConfig);
