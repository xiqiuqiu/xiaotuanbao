import { RequestMethod, type INestApplication } from '@nestjs/common'
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { REQUIRE_MENU_KEY } from '../../src/common/decorators/require-menu.decorator'

export interface RoutePermission {
  /** HTTP 方法（大写），如 GET / POST。 */
  method: string
  /** 含全局前缀 `api` 的完整路径，参数保留 Nest 形式（如 `/api/departures/:id`）。 */
  path: string
  /** 路径中参数占位统一为 `:param`，用于稳定匹配（忽略参数命名差异）。 */
  normalizedPath: string
  /** `@RequireMenu(...)` 声明的所需权限 key；未声明为 null。 */
  requiredKey: string | null
  /** 该 handler 生效的 guard 类名（含类级与方法级）。 */
  guards: string[]
  controller: string
  handler: string
}

const REQUEST_METHOD_LABEL: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.ALL]: 'ALL',
  [RequestMethod.OPTIONS]: 'OPTIONS',
  [RequestMethod.HEAD]: 'HEAD',
}

export const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function segment(value: unknown): string {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : ''
  }
  return typeof value === 'string' ? value : ''
}

function joinPath(...parts: string[]): string {
  const joined = parts
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter((part) => part.length > 0)
    .join('/')
  return `/${joined}`
}

export function normalizePath(path: string): string {
  return path.replace(/:[^/]+/g, ':param')
}

function guardNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((guard) => {
      if (typeof guard === 'function') {
        return guard.name
      }
      const ctor = (guard as { constructor?: { name?: string } })?.constructor
      return ctor?.name ?? 'UnknownGuard'
    })
    .filter((name): name is string => Boolean(name))
}

/**
 * 通过 Nest DiscoveryService 枚举所有 controller handler 的
 * 「HTTP 方法 + 路径 + @RequireMenu key + guards」，作为后端权限的**权威事实源**。
 * 只读元数据，不依赖运行时请求，故快速且确定。
 */
export function collectRoutePermissions(
  app: INestApplication,
  globalPrefix = 'api',
): RoutePermission[] {
  const discovery = app.get(DiscoveryService)
  const reflector = app.get(Reflector)
  const routes: RoutePermission[] = []

  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper
    if (!instance || !metatype) {
      continue
    }

    const controllerPath = segment(Reflect.getMetadata(PATH_METADATA, metatype))
    const classGuards = guardNames(Reflect.getMetadata(GUARDS_METADATA, metatype))
    const proto = Object.getPrototypeOf(instance)

    for (const handlerName of Object.getOwnPropertyNames(proto)) {
      if (handlerName === 'constructor') {
        continue
      }
      const handler = proto[handlerName]
      if (typeof handler !== 'function') {
        continue
      }
      const httpMethod = Reflect.getMetadata(METHOD_METADATA, handler)
      if (httpMethod === undefined) {
        continue
      }

      const methodPath = segment(Reflect.getMetadata(PATH_METADATA, handler))
      const requiredKey =
        reflector.getAllAndOverride<string | undefined>(REQUIRE_MENU_KEY, [handler, metatype]) ??
        null
      const methodGuards = guardNames(Reflect.getMetadata(GUARDS_METADATA, handler))
      const path = joinPath(globalPrefix, controllerPath, methodPath)

      routes.push({
        method: REQUEST_METHOD_LABEL[httpMethod as number] ?? String(httpMethod),
        path,
        normalizedPath: normalizePath(path),
        requiredKey,
        guards: [...classGuards, ...methodGuards],
        controller: metatype.name,
        handler: handlerName,
      })
    }
  }

  return routes.sort((a, b) =>
    `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`),
  )
}

/**
 * 给定角色被授予的 key 集合，判断能否调用某路由：
 * - 平台守卫路由：仅 Platform Admin；
 * - 无 requiredKey（仅认证）：任意登录用户可调；
 * - 有 requiredKey：需持有该 key。
 */
export function canRoleCallRoute(
  route: RoutePermission,
  grantedKeys: readonly string[],
  options: { isPlatformAdmin?: boolean } = {},
): boolean {
  if (route.guards.includes('PlatformAdminGuard')) {
    return Boolean(options.isPlatformAdmin)
  }
  if (route.requiredKey === null) {
    return true
  }
  return grantedKeys.includes(route.requiredKey)
}
