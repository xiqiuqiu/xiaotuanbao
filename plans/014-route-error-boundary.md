# 014 — 为全应用补齐路由错误边界

- **Status**: DONE
- **Commit**: 3876d55
- **Severity**: HIGH
- **Category**: Bugs & correctness
- **Rule**: Beyond the scan（React Doctor 100/100，此为静态扫描无法覆盖的架构缺口）
- **Estimated scope**: 2 个新文件 + 1 个改动文件，约 90 行（含聚焦测试）

## Problem

全项目没有任何 Error Boundary。`createRouter` 只配置了 `defaultPreload: 'intent'`，`rootRoute` 只配了 `notFoundComponent`，没有 `defaultErrorComponent` / `defaultOnCatch`；也没有类组件 `componentDidCatch` 或 `<Suspense>` 兜底（`rg "ErrorBoundary|componentDidCatch|<Suspense"` 全库 0 命中）。

后果：任意页面/抽屉在渲染期抛错（例如某个财务/发团工作区在解析后端异常结构时 throw），会冒泡到 React 根节点，把整个 SPA 崩成白屏，用户只能手动刷新且丢失当前上下文。财务、发团这类高频重工作区风险最大。

    // apps/web/src/app/router/index.tsx:211 — current
    export const router = createRouter({
      routeTree,
      defaultPreload: 'intent',
    })

    // apps/web/src/app/router/index.tsx:26 — current（仅有 notFound，无 error）
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
      notFoundComponent: NotFoundPage,
    })

TanStack Router（本仓库 `@tanstack/react-router` 1.170.17）在每个 route 的 `Match` 内部用 `route.options.errorComponent ?? router.options.defaultErrorComponent` 决定错误 UI，并自带 `CatchBoundary`。因此只要提供 `defaultErrorComponent`，路由渲染期抛出的错误就会被就地捕获成一个可重试的错误页，而不是白屏——这是官方支持的、低风险的兜底方式。

## Target

新增一个复用仓库现有 antd `Result` 风格（对齐 `NotFoundPage`）的路由错误组件，并挂到 `createRouter` 的 `defaultErrorComponent`；同时用 `defaultOnCatch` 记录错误便于排查。`ErrorComponentProps`、`ErrorRouteComponent`、`ErrorComponent`（内置兜底）均由 `@tanstack/react-router` 导出，props 形状为 `{ error: Error; reset: () => void; info?: { componentStack: string } }`。

    // 新文件 apps/web/src/components/RouteErrorState.tsx — target
    import { Button, Result, Typography } from 'antd'
    import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'

    /**
     * 路由渲染期抛错的兜底 UI，替代整站白屏。
     * reset 重挂当前路由子树；「前往发团管理」用于错误无法就地恢复时。
     */
    export function RouteErrorState({ error, reset }: ErrorComponentProps) {
      const router = useRouter()
      const description =
        error instanceof Error && error.message ? error.message : '页面出现异常，请重试。'

      return (
        <Result
          status="error"
          title="页面加载失败"
          subTitle={description}
          extra={[
            <Button
              key="retry"
              type="primary"
              onClick={() => {
                reset()
                void router.invalidate()
              }}
            >
              重试
            </Button>,
        <Button key="home" onClick={() => void router.navigate({ to: '/departure' })}>
          前往发团管理
        </Button>,
          ]}
        >
          {import.meta.env.DEV && error instanceof Error && error.stack ? (
            <Typography.Paragraph type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
              {error.stack}
            </Typography.Paragraph>
          ) : null}
        </Result>
      )
    }

    // apps/web/src/app/router/index.tsx — target（新增 import）
    import { RouteErrorState } from '@/components/RouteErrorState'

    // apps/web/src/app/router/index.tsx:211 — target（补充默认错误组件与 onCatch）
    export const router = createRouter({
      routeTree,
      defaultPreload: 'intent',
      defaultErrorComponent: RouteErrorState,
      defaultOnCatch: (error) => {
        console.error('[router] uncaught render error', error)
      },
    })

## Repo conventions to follow

- 错误页视觉复用 `apps/web/src/pages/NotFoundPage.tsx:1`：antd `Result` + `Button`，中文文案，主按钮 `type="primary"`，兜底导航跳 `/departure`。
- 组件放 `apps/web/src/components/`，具名导出（如 `apps/web/src/components/StaleDataAlert.tsx`），函数组件 + 显式 props 类型。
- 测试沿用仓库 Testing Library 风格（如 `apps/web/src/components/StaleDataAlert.test.tsx`），断言中文标题、按钮存在与点击回调。
- 保留现有 antd import 顺序与 `@/` 别名导入习惯。

## Steps

1. 新建 `apps/web/src/components/RouteErrorState.tsx`，内容见 Target；props 用 `ErrorComponentProps`，仅依赖已装的 antd 与 `@tanstack/react-router`，不新增依赖。
2. 在 `apps/web/src/app/router/index.tsx` 顶部按别名顺序加入 `import { RouteErrorState } from '@/components/RouteErrorState'`。
3. 在 `apps/web/src/app/router/index.tsx:211` 的 `createRouter` 调用里补 `defaultErrorComponent: RouteErrorState` 与 `defaultOnCatch`；不改动 `routeTree`、`defaultPreload` 及任何 route 定义。
4. 新增 `apps/web/src/components/RouteErrorState.test.tsx`：用一个 `throw new Error('boom')` 的子组件挂到最小 route，配 `defaultErrorComponent: RouteErrorState` 渲染，断言出现「页面加载失败」与「boom」，且存在「重试」「前往发团管理」按钮。再补一条恢复用例：组件首次抛错、清除条件后点击「重试」应重挂并渲染正常内容，以真正验证 `reset()+invalidate()` 生效。
5. 重新阅读 diff，删除任何无关格式化改动。

## Boundaries

- Do NOT 改任何 route 的 `component`、`beforeLoad`、`validateSearch` 或 `notFoundComponent`（404 仍由 `NotFoundPage` 负责）。
- Do NOT 引入第三方 error boundary 库或自写类组件 `componentDidCatch`——用 TanStack Router 内置的 `defaultErrorComponent` 机制即可。
- Do NOT 把错误上报接入外部监控/SDK（超出本计划范围）；`defaultOnCatch` 仅 `console.error`。
- Do NOT 修改公共组件 API 或新增依赖。
- STOP if the code has drifted from commit `3876d55`；报告漂移而不是即兴修改。

## Verification

- **Mechanical**:
  - `npx react-doctor@latest --scope changed` 分数不下降（此为新增文件，不应引入新诊断）。
  - `pnpm --filter web typecheck`
  - `pnpm --filter web test -- RouteErrorState.test.tsx`
  - `pnpm --filter web test`
- **Behavior check**: 临时在某个页面组件（如 `DeparturesPage`）顶部加 `throw new Error('boundary smoke test')`，`pnpm --filter web dev` 后访问该路由，确认渲染的是「页面加载失败」错误页而非整站白屏；点击「重试」能重挂路由、「前往发团管理」能跳转；验证完删除临时 throw。
- **Done when**: 路由渲染期错误被就地捕获为可重试错误页，不再白屏；typecheck、目标测试、全量测试通过，React Doctor 分数不降。
