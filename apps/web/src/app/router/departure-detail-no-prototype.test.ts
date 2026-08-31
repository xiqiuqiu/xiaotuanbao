/**
 * 发团详情原型已收口：详情 search 不透传 ?variant= / ?overviewVariant=；
 * 不注册发团概览独立 sandbox（#279）；其他原型（execution-layer-switch）仍保留。
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@copilotkit/react-core/v2', () => ({
  CopilotKit: () => null,
  CopilotChatConfigurationProvider: ({ children }: { children?: unknown }) => children,
  CopilotChatInput: Object.assign(() => null, { SendButton: () => null }),
  CopilotChatView: () => null,
  CopilotChatReasoningMessage: Object.assign(
    () => null,
    {
      Header: () => null,
      Content: () => null,
      Toggle: () => null,
    },
  ),
}))
vi.mock('@copilotkit/react-core/v2/styles.css', () => ({}))

import { router } from './index'

const here = dirname(fileURLToPath(import.meta.url))
const repoRootPackageJson = resolve(here, '../../../../../package.json')
const overviewPrototypeDir = resolve(
  here,
  '../../features/departure/prototype/departure-overview',
)
const overviewPrototypePage = resolve(here, '../../pages/DepartureOverviewPrototypePage.tsx')
const routerSourcePath = resolve(here, './index.tsx')

describe('departure detail overview prototype removal', () => {
  it('does not keep throwaway departure-overview prototype files', () => {
    expect(existsSync(overviewPrototypeDir)).toBe(false)
    expect(existsSync(overviewPrototypePage)).toBe(false)
  })

  it('does not register a separate overview sandbox route', () => {
    const paths = Object.keys(router.routesByPath)
    expect(paths).not.toContain('/prototype/departure-overview')
    expect(paths).not.toContain('/prototype/departure-overview/$departureId')
  })

  it('router source does not mention overviewVariant or overview prototype page', () => {
    const source = readFileSync(routerSourcePath, 'utf8')
    expect(source).not.toMatch(/overviewVariant/)
    expect(source).not.toMatch(/DepartureOverviewPrototypePage/)
    expect(source).not.toMatch(/departure-overview\/\$departureId/)
  })

  it('strips overviewVariant from departure detail search validation', () => {
    const validated = router.routesByPath['/departure/$departureId']!.options.validateSearch!({
      tab: 'overview',
      segmentId: 'seg-1',
      overviewVariant: 'B',
      variant: 'B',
      listReturn: '/departure',
    })

    expect(validated).toEqual({
      tab: 'overview',
      segmentId: 'seg-1',
      listReturn: '/departure',
    })
    expect(validated).not.toHaveProperty('overviewVariant')
    expect(validated).not.toHaveProperty('variant')
  })

  it('strips execution layer-switch prototype variant from search validation', () => {
    const validated = router.routesByPath['/departure/$departureId']!.options.validateSearch!({
      tab: 'execution',
      segmentId: 'seg-1',
      variant: 'A',
    })

    expect(validated).toEqual({
      tab: 'execution',
      segmentId: 'seg-1',
    })
    expect(validated).not.toHaveProperty('variant')
  })

  it('does not expose prototype:departure-overview script', () => {
    const pkg = JSON.parse(readFileSync(repoRootPackageJson, 'utf8')) as {
      scripts?: Record<string, string>
    }

    expect(pkg.scripts?.['prototype:departure-overview']).toBeUndefined()
    expect(
      Object.keys(pkg.scripts ?? {}).some((key) => key.includes('departure-overview')),
    ).toBe(false)
  })

  it('registers execution-layer-switch as a throwaway sandbox route', () => {
    expect(Object.keys(router.routesByPath)).toContain('/prototype/execution-layer-switch')
  })

  it('registers the global Agent conversation route', () => {
    expect(Object.keys(router.routesByPath)).toContain('/agent/conversations/$conversationId')
  })
})
