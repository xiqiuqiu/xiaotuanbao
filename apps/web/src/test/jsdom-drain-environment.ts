import { setImmediate as nodeSetImmediate } from 'node:timers'
import { builtinEnvironments, type Environment } from 'vitest/runtime'

async function drainReactScheduler() {
  // Flush React 19 passive-effect callbacks while jsdom's `window` still exists.
  for (let i = 0; i < 2; i++) {
    await new Promise<void>((resolve) => {
      nodeSetImmediate(resolve)
    })
  }
}

export default {
  name: 'jsdom',
  viteEnvironment: 'client',
  async setup(global, options) {
    const env = await builtinEnvironments.jsdom.setup(global, options)
    return {
      async teardown(global) {
        await drainReactScheduler()
        await env.teardown(global)
      },
    }
  },
} satisfies Environment
