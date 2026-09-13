import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { setImmediate as nodeSetImmediate } from 'node:timers'
import { afterAll, afterEach } from 'vitest'

async function drainReactScheduler() {
  // React 19's scheduler uses Node setImmediate. If that callback runs after
  // jsdom teardown, react-dom throws `window is not defined` as an unhandled
  // Vitest error even when every assertion passed.
  for (let i = 0; i < 2; i++) {
    await new Promise<void>((resolve) => {
      nodeSetImmediate(resolve)
    })
  }
}

afterEach(async () => {
  cleanup()
  await drainReactScheduler()
})

afterAll(async () => {
  cleanup()
  await drainReactScheduler()
})

const nativeGetComputedStyle = window.getComputedStyle.bind(window)

Object.defineProperty(window, 'getComputedStyle', {
  configurable: true,
  value: (element: Element) => nativeGetComputedStyle(element),
})

Object.defineProperty(window, 'scrollTo', {
  configurable: true,
  value: () => undefined,
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

class ResizeObserverMock {
  observe() {
    return undefined
  }
  unobserve() {
    return undefined
  }
  disconnect() {
    return undefined
  }
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverMock,
})
