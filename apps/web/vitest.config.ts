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
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    testTimeout: 10_000,
    retry: process.env.CI ? 1 : 0,
  },
})
