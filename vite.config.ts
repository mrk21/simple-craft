/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const allowedHosts = env.ALLOWED_HOSTS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

  return {
    server: {
      host: true,
      allowedHosts,
    },
    test: {
      include: ['src/**/*.test.ts'],
      environment: 'node',
    },
  };
});
