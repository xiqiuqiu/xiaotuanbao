# 001 — 将持久化 Bearer Token 迁移为 HttpOnly Cookie 会话

- **Status**: DONE
- **Commit**: b77379c
- **Severity**: HIGH
- **Category**: Security
- **Rule**: react-doctor/auth-token-in-web-storage
- **Estimated scope**: 约 17 个文件，约 250–400 行（含配置、迁移兼容层与测试）

## Problem

React Doctor 的规范要求：JWT、access token、refresh token 等认证凭证不得持久化到 `localStorage` / `sessionStorage`，应由服务端通过 `HttpOnly` Cookie 下发。当前实现把 Bearer Token 连同用户资料一起交给 Zustand `persist`，同源任意 XSS 都能读取并带走一个默认有效期 7 天的会话凭证。

```ts
// apps/web/src/app/store/auth.store.ts:7-32 — current
interface AuthState {
  token: string | null
  user: AuthUser | null
  menuKeys: string[]
  setSession: (token: string, user: AuthUser, menuKeys: string[]) => void
  logout: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      menuKeys: [],
      setSession: (token, user, menuKeys) => set({ token, user, menuKeys }),
      logout: () => set({ token: null, user: null, menuKeys: [] }),
      isAuthenticated: () => Boolean(get().token),
    }),
    {
      name: AUTH_STORAGE_KEY,
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        menuKeys: state.menuKeys,
      }),
    },
  ),
)
```

请求层会在普通 JSON 请求和二进制下载中主动读取该 token，并拼装 `Authorization` 请求头：

```ts
// apps/web/src/lib/request/client.ts:17-29,126-140 — current
const http = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
})

http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  // ...
})

const token = useAuthStore.getState().token
const response = await axios.get(`${env.apiBaseUrl}${url}`, {
  ...config,
  responseType: 'blob',
  headers: {
    ...(config?.headers ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
})
```

服务端登录响应直接暴露 token，Passport 也只接受 Bearer Header；当前“退出登录”仅清理浏览器状态，没有使服务端 Cookie/会话失效的端点：

```ts
// apps/api/src/modules/auth/auth.service.ts:67-79 — current
const session = this.buildSession(user)
const payload: JwtPayload = {
  sub: user.id,
  organizationId: user.organizationId,
  isPlatformAdmin: user.isPlatformAdmin,
}
const accessToken = await this.jwtService.signAsync(payload)

return {
  accessToken,
  ...session,
}

// apps/api/src/modules/auth/jwt.strategy.ts:15-19 — current
super({
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  ignoreExpiration: false,
  secretOrKey: configService.getOrThrow<string>('app.jwtSecret'),
})

// apps/web/src/layouts/MainLayout.tsx:127-133 — current
{
  key: 'logout',
  icon: <LogoutOutlined />,
  label: '退出登录',
  onClick: () => {
    logout()
    navigate({ to: '/login' })
  },
}
```

该迁移不能假定前后端永远同源。仓库默认 Docker/Caddy 是同源 `/api` 反代，但 `VITE_API_BASE_URL` 可配置为绝对 URL；本地 Vite 也可能跨 `localhost:5173 → localhost:3000`。当前 CORS 在生产直接关闭，在开发允许任意 origin 并同时允许 credentials，不足以支持安全的跨源 Cookie：

```ts
// apps/api/src/main.ts:28-31 — current
app.enableCors({
  origin: nodeEnv === 'production' ? false : true,
  credentials: true,
})
```

Cookie 会被浏览器自动附带，因此还必须同时收紧 CORS 并防御 CSRF；仅把 Bearer Token 搬进 Cookie 会把“XSS 可窃取凭证”变成“跨站可借用凭证”。

## Target

目标遵循 `react-doctor/auth-token-in-web-storage` 的 canonical recommendation：认证 JWT 只由服务端写入 `HttpOnly`、`Secure`、`SameSite` Cookie；前端 JavaScript 不接触、持久化或手工转发任何认证 token。

### 1. 服务端 Cookie 契约

新增 `apps/api/src/modules/auth/auth-cookie.ts`，集中定义唯一 Cookie 名称、读取与写入选项，确保登录与清除使用完全相同的 `path/domain/sameSite/secure`。Cookie 默认使用 host-only（不要无故设置 `Domain`），路径限制为 `/api`：

```ts
// apps/api/src/modules/auth/auth-cookie.ts — target
import type { CookieOptions, Request } from 'express'

export const AUTH_COOKIE_NAME = 'xtb_session'

export function extractAuthCookie(request: Request): string | null {
  const raw = request.headers.cookie
  if (!raw) return null

  for (const part of raw.split(';')) {
    const [name, ...valueParts] = part.trim().split('=')
    if (name === AUTH_COOKIE_NAME) {
      return decodeURIComponent(valueParts.join('=')) || null
    }
  }
  return null
}

export function authCookieOptions(config: {
  secure: boolean
  sameSite: 'lax' | 'strict' | 'none'
  maxAgeMs: number
  domain?: string
}): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: config.sameSite,
    path: '/api',
    maxAge: config.maxAgeMs,
    ...(config.domain ? { domain: config.domain } : {}),
  }
}
```

在 `apps/api/src/config/app.config.ts` 增加并校验以下配置（命名可按本文件既有风格落地，但语义不可改变）：

```ts
// target configuration shape
auth: {
  cookieSecure: process.env.AUTH_COOKIE_SECURE === 'true',
  cookieSameSite: process.env.AUTH_COOKIE_SAME_SITE ?? 'lax',
  cookieDomain: process.env.AUTH_COOKIE_DOMAIN || undefined,
  allowedOrigins: (process.env.WEB_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean),
  allowLegacyBearer: process.env.AUTH_ALLOW_LEGACY_BEARER === 'true',
}
```

启动时必须 fail fast：生产环境不得使用默认 `JWT_SECRET`；`AUTH_COOKIE_SAME_SITE=none` 时必须同时为 `AUTH_COOKIE_SECURE=true`；`WEB_ORIGINS` 每项必须是精确 origin（协议 + 主机 + 可选端口，不得含路径、通配符或尾斜杠）。Cookie 的 `maxAge` 应从 `JWT_EXPIRES_IN` 解析并与 JWT `exp` 对齐，不得另造一个更长的固定期限。

### 2. 登录、鉴权与退出

`AuthService.login` 继续签发 JWT，但只把 token 返回给 controller 内部；共享的 HTTP 响应 `LoginResult` 不再包含 `accessToken`：

```ts
// packages/shared/src/types/api.types.ts:23-32 — target
export interface SessionPayload {
  user: AuthUser
  menuKeys: string[]
}

export interface LoginResult extends SessionPayload {}
export interface MeResult extends SessionPayload {}

// apps/api/src/modules/auth/auth.service.ts — target return shape used internally
export interface CreatedSession {
  token: string
  session: LoginResult
}

return {
  token: await this.jwtService.signAsync(payload),
  session: this.buildSession(user),
}
```

Controller 负责设置/清除 Cookie，公开响应不含 token：

```ts
// apps/api/src/modules/auth/auth.controller.ts — target
@Post('login')
async login(
  @Body() dto: LoginDto,
  @Res({ passthrough: true }) response: Response,
): Promise<LoginResult> {
  const { token, session } = await this.authService.login(dto)
  response.cookie(AUTH_COOKIE_NAME, token, this.cookieOptions)
  return session
}

@Post('logout')
@HttpCode(204)
logout(@Res({ passthrough: true }) response: Response): void {
  response.clearCookie(AUTH_COOKIE_NAME, this.clearCookieOptions)
}
```

`JwtStrategy` 最终只从 Cookie 读取认证凭证。为避免 Web 与 API 分步发布期间让在线用户瞬间掉线，按同一代码内的显式兼容开关做一次渐进迁移：

```ts
// apps/api/src/modules/auth/jwt.strategy.ts — target during compatibility window
const extractors = [extractAuthCookie]
if (configService.get<boolean>('app.auth.allowLegacyBearer', false)) {
  extractors.push(ExtractJwt.fromAuthHeaderAsBearerToken())
}

super({
  jwtFromRequest: ExtractJwt.fromExtractors(extractors),
  ignoreExpiration: false,
  secretOrKey: configService.getOrThrow<string>('app.jwtSecret'),
})
```

兼容开关只影响“接受旧 Header”，不得让新登录响应重新暴露 token，也不得让 Web 继续发送 Header。部署顺序为：先发布支持 Cookie 且临时 `AUTH_ALLOW_LEGACY_BEARER=true` 的 API → 发布不再使用 Bearer 的 Web → 观察一个旧 JWT 最长有效期（当前默认 7 天）后设为 `false` → 下一次代码清理删除 Header extractor 与该开关。若当前发布系统不能保证此顺序，停止实施并先拆成两个可独立回滚的发布，不要把 `true` 永久当默认值。

### 3. 跨源 credentials、CORS 与 CSRF

客户端两个 Axios 调用点都明确发送 credentials，删除所有 Authorization 组装：

```ts
// apps/web/src/lib/request/client.ts — target
const http = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 30_000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

// download target
const response = await axios.get(`${env.apiBaseUrl}${url}`, {
  ...config,
  responseType: 'blob',
  withCredentials: true,
})
```

服务端 CORS 只回显显式 allowlist 中的 origin，绝不使用 `*` + credentials；同源请求没有 `Origin` 匹配问题，跨源请求必须命中 `WEB_ORIGINS`：

```ts
// apps/api/src/main.ts — target
app.enableCors({
  origin: allowedOrigins,
  credentials: true,
})
```

新增全局 `CsrfOriginGuard`（通过 `APP_GUARD` 注册，保证 `createTestApp()` 与生产启动路径一致）：

- `GET` / `HEAD` / `OPTIONS` 放行；
- 所有 `POST` / `PUT` / `PATCH` / `DELETE`（包括 `/api/auth/login` 与 `/api/auth/logout`）要求 `Origin` 精确命中 `WEB_ORIGINS`；
- 不信任 `Host`、`Referer` 或请求体中的 origin；不允许后缀匹配（例如 `evil-example.com` 冒充 `example.com`）；
- 非浏览器集成方如果确有需求，必须另行设计独立认证，不得通过“缺少 Origin 就放行”绕过；
- 对不匹配或缺失 Origin 返回 403，并提供稳定错误消息供测试断言。

该 Origin 校验是 Cookie 认证的 CSRF 主防线，`SameSite=lax/strict` 是纵深防御；若部署要求跨站（不是仅跨 origin）Cookie，显式配置 `SameSite=None; Secure` 仍由 Origin allowlist 防 CSRF。不要采用“前端读取认证 Cookie 再复制到 Header”的伪 CSRF 方案，因为认证 Cookie 必须保持 HttpOnly。

### 4. 前端会话状态

Zustand 只保存内存态用户资料，不再使用 `persist`，认证真相由 `/auth/me` + Cookie 决定：

```ts
// apps/web/src/app/store/auth.store.ts — target
interface AuthState {
  user: AuthUser | null
  menuKeys: string[]
  sessionStatus: 'unknown' | 'authenticated' | 'anonymous'
  setSession: (user: AuthUser, menuKeys: string[]) => void
  clearSession: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  menuKeys: [],
  sessionStatus: 'unknown',
  setSession: (user, menuKeys) =>
    set({ user, menuKeys, sessionStatus: 'authenticated' }),
  clearSession: () =>
    set({ user: null, menuKeys: [], sessionStatus: 'anonymous' }),
  isAuthenticated: () => get().sessionStatus === 'authenticated',
}))
```

`ensureAuthenticatedSession` 不再先检查本地 token；每次受保护路由进入时调用 `/auth/me` 恢复内存态。登录成功直接使用不含 token 的 `LoginResult`。退出先请求服务端清 Cookie，并在 `finally` 清内存状态与查询缓存后跳转：

```ts
// apps/web/src/lib/auth/session.ts — target
export async function ensureAuthenticatedSession(pathname: string) {
  try {
    const me = await getMe()
    useAuthStore.getState().setSession(me.user, me.menuKeys)
  } catch {
    useAuthStore.getState().clearSession()
    throw redirect({ to: '/login', search: { redirect: pathname } })
  }

  if (!isMenuPathAllowed(pathname, useAuthStore.getState().menuKeys)) {
    throw redirect({ to: '/' })
  }
}

// apps/web/src/pages/LoginPage.tsx — target success path
onSuccess: (result) => {
  setSession(result.user, result.menuKeys)
  // preserve existing query invalidations
  navigate({ to: '/departure' })
}
```

401 处理仍清空内存态并跳到登录页，但 `/auth/login` 的密码错误及 `/auth/me` 的匿名探测不得重复弹“登录已过期”或造成 `/login` 重定向循环。通过请求 config（例如 `skipAuthRedirect`）明确区分匿名探测，不要依赖 URL 字符串碰运气。

浏览器中历史 `xiaotuanbao-auth` 数据必须做一次无条件清理（只删该 key，保留 `xiaotuanbao.login.rememberedUsername`），以便升级后立即销毁残留 token；清理逻辑在应用启动时执行一次，后续版本可在兼容窗口结束后删除。

## Repo conventions to follow

- 请求封装沿用 `apps/web/src/lib/request/client.ts:42-88` 的统一响应解包、401 处理与泛型 API，不要在页面直接引入第二个 Axios 实例。
- 服务端会话用户结构沿用 `apps/api/src/modules/auth/auth.service.ts:106-138` 的 `buildSession` / `resolveMenuKeys`，不要重复实现角色权限解析。
- API 单元测试沿用 `apps/api/src/modules/auth/auth.service.spec.ts:6-45` 的 Jest mock 风格；E2E 沿用 `apps/api/test/helpers.ts:13-73` 的 `createTestApp` / `loginAs` / `authRequest` 集中助手，避免逐个业务 spec 改写认证细节。
- Web 测试沿用现有 Vitest + Testing Library 配置；新增聚焦测试应与被测文件同目录，测试 observable state/request 行为，不快照整个页面。
- Docker 生产路径当前经 `docker/caddy/Caddyfile:1-12` 同源反代 `/api`；保留该默认路径，同时让显式绝对 `VITE_API_BASE_URL` 的跨源部署可通过 `WEB_ORIGINS` 与 Cookie 属性配置安全运行。
- 保持 Ant Design 登录页视觉、菜单权限与现有中文错误文案；“记住账号”仅持久化用户名，不是认证凭证，可以保留。

## Steps

1. 在 `packages/shared/src/types/api.types.ts:23-32` 删除 `LoginResult.accessToken`，让登录公开响应只含 `user` 与 `menuKeys`；构建 shared package，先用类型错误列出所有 token 依赖点，确认只涉及本计划已识别位置。
2. 在 `apps/api/src/config/app.config.ts:3-10` 增加 Cookie、精确 origin allowlist、legacy Bearer 开关及 JWT 时长到毫秒的配置；对非法 `SameSite/Secure` 组合、非法 origin 和生产默认 secret 做启动失败校验。同步 `.env.example`、`apps/web/.env.example`（仅在前端配置说明确有必要时）和 `docs/deploy/environment-variables.md:28-57,68-101`，分别给出同源 Caddy、本地 Vite 跨 origin、独立 Web/API 跨站三种示例。
3. 新建 `apps/api/src/modules/auth/auth-cookie.ts`，按 Target 集中实现 Cookie 提取、写入与清除选项；不得引入 Cookie 解析依赖，也不得设置宽泛父域 Domain 作为默认值。
4. 在 `apps/api/src/modules/auth/auth.service.ts:34-80` 把登录结果拆成内部 `{ token, session }`；保留密码校验、`last_login_at` 和 JWT payload，不改变用户/权限业务语义。更新 `apps/api/src/modules/auth/auth.service.spec.ts:6-45`，额外断言内部 token 与公开 session 分离。
5. 在 `apps/api/src/modules/auth/auth.controller.ts:1-20` 由 controller 使用 `@Res({ passthrough: true })` 设置 HttpOnly Cookie；新增 `POST /api/auth/logout` 并用完全一致的 Cookie 属性清除；补 controller 或 auth E2E 测试，断言登录响应体没有 `accessToken`，`Set-Cookie` 含 `HttpOnly`、预期 `Secure` / `SameSite` / `Path=/api`，logout 返回 204 并让旧 Cookie 无法继续访问 `/auth/me`。
6. 在 `apps/api/src/modules/auth/jwt.strategy.ts:10-20` 按兼容开关采用 Cookie-first extractor；默认及最终状态只接受 Cookie。为 extractor 写表格测试：Cookie 有效、Cookie 缺失、畸形 Cookie、兼容开关关闭时 Bearer 被拒、兼容开关开启时旧 Bearer 暂时可用、Cookie 与 Header 同时存在时 Cookie 优先。
7. 新增 `apps/api/src/common/guards/csrf-origin.guard.ts` 并在 `apps/api/src/app.module.ts:16-35` 通过 `APP_GUARD` 全局注册。测试 safe methods、允许 origin、伪造后缀 origin、未配置 origin、缺失 origin，确保所有 mutation 的 403 行为一致；测试中显式使用 `http://localhost:5173`，不要为测试添加 bypass。
8. 在 `apps/api/src/main.ts:13-31` 用配置后的精确 allowlist 替换 `production ? false : true`。用真实预检请求验证允许 origin 得到单一 `Access-Control-Allow-Origin` 与 `Access-Control-Allow-Credentials: true`，拒绝 origin 不得到 CORS 授权头。
9. 在 `apps/api/test/helpers.ts:39-73` 将 `loginAs` 改为从 `Set-Cookie` 捕获 `xtb_session`，将 `authRequest` 改为设置 `Cookie` 而非 `Authorization`，并让所有 mutation/login 自动设置测试 allowlist 中的 `Origin`。保持 helper 返回值仍可由现有测试透传，避免机械修改所有业务 E2E spec。新增 auth E2E 覆盖登录 → me → mutation CSRF 拒绝 → logout → me 401 完整闭环。
10. 在 `apps/web/src/app/store/auth.store.ts:1-35` 删除 `persist`、`AUTH_STORAGE_KEY` 与 token 字段，采用 Target 的内存 session 状态；新增 store 测试，断言任何 state transition 都不会把凭证写入 local/session storage。
11. 在 Web 启动入口（先定位实际 `createRoot` 文件）增加一次精确的 `localStorage.removeItem('xiaotuanbao-auth')` 迁移清理；测试只删除旧认证 key，不删除 `xiaotuanbao.login.rememberedUsername` 或其他业务数据。
12. 在 `apps/web/src/lib/request/client.ts:17-40,126-140` 为 JSON 与二进制请求统一设置 `withCredentials: true`，删除 token 读取和 Authorization Header；保留现有财务 `Idempotency-Key` 逻辑。补 request 测试，断言普通请求/下载都携带 credentials 且没有 Authorization。
13. 在 `apps/web/src/services/auth.service.ts:10-16` 新增 `logout(): Promise<void>`，并为 `getMe` 支持显式匿名探测 config；在 `apps/web/src/lib/request/client.ts:55-69,153-160` 把 401 逻辑改成 `clearSession`，确保登录密码错误、匿名 `/me` 探测与已登录会话过期三种路径各自只产生预期反馈。
14. 在 `apps/web/src/lib/auth/session.ts:6-23` 删除 token 前置判断，始终用 `/auth/me` 恢复会话；在 `apps/web/src/app/router/index.tsx` 让 `/login` 的保护逻辑兼容 HttpOnly Cookie（不能以“JS 读不到 token”推断匿名），并避免重复 `/me` 请求；为刷新受保护路由、匿名访问、权限不足与已有 Cookie 访问 `/login` 添加路由级测试。
15. 在 `apps/web/src/pages/LoginPage.tsx:69-80` 改为 `setSession(result.user, result.menuKeys)`；在 `apps/web/src/layouts/MainLayout.tsx:123-135` 调用服务端 logout，在 `finally` 清 session 与 React Query 缓存后导航。快速重复点击退出只能发一个请求，失败时本地仍回到匿名状态并提示服务器清除失败风险。
16. 更新 `docs/deploy/docker-deploy.md:7-15,46-57` 与 `.env.example`：同源 Caddy 仍用 `VITE_API_BASE_URL=/api`，生产列明 `WEB_ORIGINS=https://实际前端域名`、`AUTH_COOKIE_SECURE=true`；仅跨站部署使用 `AUTH_COOKIE_SAME_SITE=none`。不要把示例域名原样当生产默认值。
17. 分阶段发布并保留回滚路径：先 API dual-read/cookie-write，再 Web cookie-only，观察旧 token TTL 后关闭 legacy Bearer。每一阶段分别验证登录、页面刷新、下载、401、退出、跨源预检与 CSRF；若任一阶段回滚 Web，API 的临时 Bearer 兼容仍能承接旧客户端，但新登录响应不再提供 token，因此回滚前端版本必须与对应旧 API 成对回滚，需在发布单明确记录。
18. 重读 diff，搜索 `accessToken|Authorization|Bearer|xiaotuanbao-auth|sessionStorage|localStorage`。允许保留的仅限：用户名记忆、兼容 extractor 与明确的迁移测试/文档；删除任何新的认证 token 前端可见路径和无关格式化变更。

## Boundaries

- 不更换 JWT 算法、不引入 refresh token、不增加数据库 session 表；本计划只改变现有短期 JWT 的运输与浏览器存储位置。若产品要求服务端即时吊销所有会话，应另立 session/revocation 设计，不要顺手塞入本计划。
- 不改变 `AuthUser`、角色、菜单权限、账号禁用校验、JWT payload 或业务 API 的授权规则。
- 不把用户名“记住账号”误删；它不是认证凭证，但密码与 token 永远不得持久化。
- 不使用 `SameSite=None` 作为通用默认；只有确认前后端确属不同 site 时才配合 `Secure` 启用。
- 不使用 wildcard CORS、不反射任意 Origin、不在 CSRF guard 中允许缺失 Origin、不以 `Referer` 作为主要判据。
- 不在 localStorage 保存“加密后的 token”；前端掌握解密材料仍不能解决 XSS。
- 不新增 Cookie 解析依赖；当前只需读取一个固定 Cookie，使用小型、聚焦、经过测试的 extractor。
- 不修改任何财务、发团、供应商业务行为；E2E helper 迁移应让既有业务测试无感继续运行。
- 不永久保留 `AUTH_ALLOW_LEGACY_BEARER=true`。兼容窗口结束后的删除应有明确跟踪项；默认值必须为 `false`。
- 如果部署拓扑、允许前端 origin、HTTPS 能力或发布顺序无法确认，停止在配置/发布步骤并报告，不得猜测同源或擅自降级 Cookie 安全属性。
- 若代码已偏离 commit `b77379c`（尤其 auth store、request client、AuthController、JwtStrategy 或共享 `LoginResult`），停止执行并报告 drift，不要套用过期摘录。
- 不添加无关依赖、格式化或重构；只做本计划列出的认证链路、配置、测试和文档变更。

## Verification

- **Mechanical**:
  - `pnpm typecheck`
  - `pnpm --filter api test -- auth.service.spec.ts`
  - `pnpm --filter api test:e2e -- auth`（按新增 auth E2E 文件名调整；必须串行使用测试数据库）
  - `pnpm --filter web test -- auth.store request session LoginPage MainLayout`（按新增测试文件名调整）
  - `pnpm --filter web build && pnpm --filter api build`
  - `npx react-doctor@latest --scope changed`：`react-doctor/auth-token-in-web-storage` 清零且总分不下降。
  - `rg -n "accessToken|Authorization|Bearer|xiaotuanbao-auth|sessionStorage" apps/web/src packages/shared/src`：前端运行时代码不再存在认证 token 或 Bearer 发送路径；旧 key 只允许出现在一次性清理和测试中。
  - 用 Supertest 覆盖：登录响应无 token；Cookie 属性正确；Cookie 可访问 `/api/auth/me`；无 Cookie 401；logout 后同一 Cookie 401；mutation 缺失/伪造 Origin 403；allowlist Origin 成功。
- **Behavior check**:
  1. 本地 Vite + API（`http://localhost:5173` → `http://localhost:3000`）登录，DevTools Application 中可看到 `xtb_session`，但 JavaScript `document.cookie`、Local Storage、Session Storage 均看不到认证 token；刷新 `/departure` 后仍保持登录。
  2. Docker/Caddy 同源部署登录并刷新；Network 中请求带 Cookie、无 Authorization。确认普通 JSON 请求与导出下载都成功。
  3. 让 Cookie 过期或手工删除后访问受保护页：仅提示一次“登录已过期”，跳转 `/login`，无重定向循环；用户名记忆仍保留。
  4. 点击“退出登录”：Network 出现 `POST /api/auth/logout`，响应清除 Cookie；浏览器后退或直接请求 `/api/auth/me` 均为 401，React Query 不展示上一用户缓存。
  5. 从不在 `WEB_ORIGINS` 的测试页面发起 credentialed mutation，预检/请求被拒；从 allowlist origin 发起相同请求成功。分别验证 `SameSite=Lax` 的同站部署与（若实际需要）`SameSite=None; Secure` 的跨站部署。
  6. 迁移窗口中分别用 Cookie 和旧 Bearer 验证 API；关闭 `AUTH_ALLOW_LEGACY_BEARER` 后旧 Bearer 必须 401，而 Cookie 继续成功。
- **Done when**: 前端运行时完全不读取、存储或发送 JWT；服务端只通过安全 Cookie 向新客户端提供会话，登录/刷新/下载/401/退出闭环通过；CORS 与 CSRF 在实际部署拓扑下有自动化和人工证据；兼容开关默认关闭并有明确到期清理；React Doctor 目标诊断清除且所有类型、构建、聚焦测试通过。
