import type { INestApplication } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  CAPABILITIES,
  PRESET_ROLE_NAMES,
  V1_ACTION_KEYS,
  V1_MENU_KEYS,
  presetRoleGrantedKeys,
  type CapabilityId,
} from '@xiaotuanbao/shared'
import { AppModule } from '../src/app.module'
import {
  MUTATING_METHODS,
  canRoleCallRoute,
  collectRoutePermissions,
  normalizePath,
  type RoutePermission,
} from './support/collect-route-permissions'

/**
 * 后端权威权限矩阵测试（配合 ADR-0023 与 @xiaotuanbao/shared 能力单一事实源）。
 *
 * 目标：把「后端每个路由需要什么权限」固化成可校验的事实源，并守住三条底线：
 *  1) 任何写接口都必须显式挂 @RequireMenu（或平台守卫）——防止漏挂 guard 变成谁都能调的洞；
 *  2) 用到的每把 key 都是已知 key——防止拼写漂移；
 *  3) 前端能力清单声明的 requiredKey 必须与实际端点校验的一致——这是"UI 能点、API 403"的根治点。
 * 另外产出「角色 × 可调端点」矩阵快照，任何权限面变化都会在评审时显现。
 */

/** 少数刻意不做 RBAC key 校验的写接口（仅认证或完全公开），显式登记以便审查。 */
const PUBLIC_MUTATING_ALLOWLIST = new Set<string>([
  'POST /api/auth/login',
  'POST /api/auth/logout',
])

/**
 * 能力 → 代表性端点。断言这些端点确实存在，且其 @RequireMenu key 与能力清单一致。
 * 前端 gating 由同一份能力清单派生，故此断言把前后端 key 绑死，杜绝 drift。
 */
const CAPABILITY_ENDPOINTS: Record<CapabilityId, Array<{ method: string; path: string }>> = {
  departureWrite: [
    { method: 'POST', path: '/api/departures' },
    { method: 'POST', path: '/api/departures/:id/copy' },
    { method: 'PATCH', path: '/api/departures/:id' },
    { method: 'POST', path: '/api/departures/:id/transition' },
    { method: 'POST', path: '/api/departures/:id/close' },
    { method: 'POST', path: '/api/departures/:id/source-orders' },
    { method: 'PATCH', path: '/api/source-orders/:id' },
    { method: 'DELETE', path: '/api/source-orders/:id' },
    { method: 'POST', path: '/api/departures/:id/segments' },
    { method: 'PATCH', path: '/api/segments/:id' },
    { method: 'POST', path: '/api/segments/:id/resources' },
    { method: 'PATCH', path: '/api/segment-resources/:id' },
    { method: 'POST', path: '/api/route-templates' },
    { method: 'POST', path: '/api/finance/payment-schedules/:id/void-resource-payable' },
  ],
  partnerWrite: [
    { method: 'POST', path: '/api/partners' },
    { method: 'PATCH', path: '/api/partners/:id' },
    { method: 'POST', path: '/api/partners/:id/archive' },
    { method: 'POST', path: '/api/partners/:id/restore' },
  ],
  supplierWrite: [
    { method: 'POST', path: '/api/suppliers' },
    { method: 'PATCH', path: '/api/suppliers/:id' },
    { method: 'POST', path: '/api/suppliers/:id/archive' },
    { method: 'POST', path: '/api/suppliers/:id/restore' },
  ],
  financeMutate: [
    { method: 'POST', path: '/api/finance/payment-schedules/:id/cancel' },
    { method: 'POST', path: '/api/finance/payment-schedules/:id/reopen' },
    { method: 'POST', path: '/api/finance/payment-schedules/:id/adjust-amount' },
    { method: 'POST', path: '/api/finance/receivables' },
    { method: 'POST', path: '/api/finance/payables' },
    { method: 'POST', path: '/api/finance/transactions' },
    { method: 'POST', path: '/api/finance/verifications' },
  ],
}

describe('权限矩阵 — 后端权威事实源 (e2e)', () => {
  let app: INestApplication
  let routes: RoutePermission[]

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile()
    app = moduleRef.createNestApplication()
    app.setGlobalPrefix('api')
    await app.init()
    routes = collectRoutePermissions(app)
  })

  afterAll(async () => {
    await app?.close()
  })

  function findRoute(method: string, path: string): RoutePermission | undefined {
    const normalized = normalizePath(path)
    return routes.find(
      (route) => route.method === method && route.normalizedPath === normalized,
    )
  }

  it('枚举到了受权限保护的路由（自检）', () => {
    expect(routes.length).toBeGreaterThan(50)
    expect(routes.some((route) => route.requiredKey !== null)).toBe(true)
  })

  it('每个写接口都显式挂了 @RequireMenu 或平台守卫（无漏挂 guard 的洞）', () => {
    const offenders = routes
      .filter((route) => MUTATING_METHODS.has(route.method))
      .filter((route) => route.requiredKey === null)
      .filter((route) => !route.guards.includes('PlatformAdminGuard'))
      .filter((route) => !PUBLIC_MUTATING_ALLOWLIST.has(`${route.method} ${route.path}`))
      .map((route) => `${route.method} ${route.path} (${route.controller}.${route.handler})`)

    expect(offenders).toEqual([])
  })

  it('所有 @RequireMenu 用到的 key 都是已知的 menu/action key', () => {
    const knownKeys = new Set<string>([...V1_MENU_KEYS, ...V1_ACTION_KEYS])
    const unknown = routes
      .filter((route) => route.requiredKey !== null && !knownKeys.has(route.requiredKey))
      .map((route) => `${route.method} ${route.path} → ${route.requiredKey ?? ''}`)

    expect(unknown).toEqual([])
  })

  describe('能力清单 ↔ 端点 契约（前后端 key 绑死）', () => {
    for (const [capabilityId, endpoints] of Object.entries(CAPABILITY_ENDPOINTS) as Array<
      [CapabilityId, Array<{ method: string; path: string }>]
    >) {
      const expectedKey = CAPABILITIES[capabilityId].requiredKey

      for (const endpoint of endpoints) {
        it(`${capabilityId}: ${endpoint.method} ${endpoint.path}`, () => {
          const route = findRoute(endpoint.method, endpoint.path)
          expect(route).toBeDefined()
          if (!route) {
            return
          }
          if (capabilityId === 'financeMutate') {
            // 财务账款端点分属四个 /finance/* menu key，统一以 /finance/ 前缀校验。
            expect(route.requiredKey?.startsWith('/finance/')).toBe(true)
          } else {
            expect(route.requiredKey).toBe(expectedKey)
          }
        })
      }
    }
  })

  describe('角色 × 端点 可达性不变量', () => {
    const financeKeys = presetRoleGrantedKeys(PRESET_ROLE_NAMES.FINANCE)
    const coordinatorKeys = presetRoleGrantedKeys(PRESET_ROLE_NAMES.COORDINATOR)

    it('财务不可调用任何 departure:write 接口', () => {
      const reachable = routes
        .filter((route) => route.requiredKey === 'departure:write')
        .filter((route) => canRoleCallRoute(route, financeKeys))
        .map((route) => `${route.method} ${route.path}`)
      expect(reachable).toEqual([])
    })

    it('计调不可调用任何 /finance/* 接口', () => {
      const reachable = routes
        .filter((route) => route.requiredKey?.startsWith('/finance/'))
        .filter((route) => canRoleCallRoute(route, coordinatorKeys))
        .map((route) => `${route.method} ${route.path}`)
      expect(reachable).toEqual([])
    })

    it('计调与财务均不可调用任何 /system/* 接口', () => {
      for (const keys of [financeKeys, coordinatorKeys]) {
        const reachable = routes
          .filter((route) => route.requiredKey?.startsWith('/system/'))
          .filter((route) => canRoleCallRoute(route, keys))
          .map((route) => `${route.method} ${route.path}`)
        expect(reachable).toEqual([])
      }
    })

    it('任何预设租户角色都不可调用平台守卫接口', () => {
      for (const role of Object.values(PRESET_ROLE_NAMES)) {
        const keys = presetRoleGrantedKeys(role)
        const reachable = routes
          .filter((route) => route.guards.includes('PlatformAdminGuard'))
          .filter((route) => canRoleCallRoute(route, keys, { isPlatformAdmin: false }))
          .map((route) => `${route.method} ${route.path}`)
        expect(reachable).toEqual([])
      }
    })
  })

  it('角色 × 可调端点 矩阵快照（权限面变化需评审确认）', () => {
    const matrix: Record<string, string[]> = {}
    for (const role of Object.values(PRESET_ROLE_NAMES)) {
      const keys = presetRoleGrantedKeys(role)
      matrix[role] = routes
        .filter((route) => canRoleCallRoute(route, keys))
        .map((route) => `${route.method} ${route.path} [${route.requiredKey ?? '—'}]`)
    }
    expect(matrix).toMatchSnapshot()
  })

  it('全部路由 → 权限 key 清单快照（后端权威事实源）', () => {
    const table = routes.map((route) => ({
      route: `${route.method} ${route.path}`,
      requiredKey: route.requiredKey,
      guards: route.guards.join('+'),
    }))
    expect(table).toMatchSnapshot()
  })
})
