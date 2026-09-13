import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@xiaotuanbao/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@xiaotuanbao/ai-contracts': path.resolve(__dirname, '../../packages/ai-contracts/src/index.ts'),
    },
  },
  test: {
    environment: './src/test/jsdom-drain-environment.ts',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    testTimeout: 10_000,
    retry: process.env.CI ? 1 : 0,
    onUnhandledError(error) {
      const message = 'message' in error ? String(error.message) : ''
      const stack = 'stack' in error ? String(error.stack ?? '') : ''
      // React 19 reads `window.event` from a setImmediate queued before jsdom teardown.
      if (message === 'window is not defined' && stack.includes('performWorkUntilDeadline')) {
        return false
      }
    },
  },
})
