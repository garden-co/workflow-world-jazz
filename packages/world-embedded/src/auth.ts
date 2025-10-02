import type { AuthProvider } from '@vercel/workflow-world';

export const auth: AuthProvider = {
  async getAuthInfo() {
    return {
      ownerId: 'embedded-owner',
      projectId: 'embedded-project',
      environment: 'embedded',
      userId: 'embedded-user',
    };
  },

  async checkHealth() {
    return {
      success: true,
      data: { healthy: true },
      message: 'Embedded backend is healthy',
    };
  },
};
