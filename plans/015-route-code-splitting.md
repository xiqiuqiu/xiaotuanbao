# 015 — 路由级代码分割（懒加载页面）

- **Status**: TODO
- **Commit**: 3876d55
- **Severity**: MEDIUM
- **Category**: Performance
- **Rule**: Beyond the scan（React Doctor 100/100，打包策略非静态规则可覆盖）
- **Estimated scope**: 1 个改动文件（`router/index.tsx`）+ 可选 1 个 pending 组件，约 60 行

## Problem

所有页面在路由表里被静态 `import` 进主 chunk，`vite.config.ts` 也未配置 `manualChunks`，因此首屏必须下载全部业务代码（15+ 页面 + 600 行级重抽屉如 `CreateVerificationDrawer` 663 行、`VerificationsWorkspace` 500 行等经由页面被静态引入）。用户登录后即使只看发团列表，也已经付出了整包解析成本。

    // apps/web/src/app/router/index.tsx:12-24 — current（全部静态导入）
    import { PartnersPage } from '@/features/partner/pages/PartnersPage'
    import { DeparturesPage } from '@/features/departure/pages/DeparturesPage'
    import { CreateDeparturePage } from '@/features/departure/pages/CreateDeparturePage'
    import { DepartureDetailPage } from '@/features/departure/pages/DepartureDetailPage'
    import { EmployeesPage } from '@/pages/system/EmployeesPage'
    import { SuppliersPage } from '@/features/supplier/pages/SuppliersPage'
    import { SupplierDetailPage } from '@/features/supplier/pages/SupplierDetailPage'
    import { PartnerDetailPage } from '@/features/partner/pages/PartnerDetailPage'
    import { ReceivablesPage } from '@/features/finance/pages/ReceivablesPage'
    import { PayablesPage } from '@/features/finance/pages/PayablesPage'
    import { TransactionsPage } from '@/features/finance/pages/TransactionsPage'
    import { VerificationsPage } from '@/features/finance/pages/VerificationsPage'
    import { OrganizationPage } from '@/pages/system/OrganizationPage'
    import { HomePage } from '@/pages/HomePage'

    // apps/web/src/app/router/index.tsx:55-59 — current（route 直接用静态组件）
    const departureRoute = createRoute({
      getParentRoute: () => appLayoutRoute,
      path: '/departure',
      component: DeparturesPage,
    })

## Target

用 TanStack Router（`@tanstack/react-router` 1.170.17）导出的 `lazyRouteComponent(importer, exportName?)` 把**受保护布局下的业务页面**改为按需加载，Vite 会据动态 `import()` 自动分包。`LoginPage`、`AppLayout`、`NotFoundPage` 保持静态导入（它们是外壳/首帧必需）。同时提供 `defaultPendingComponent` 作为分包加载中的占位。

`lazyRouteComponent` 的第二参为具名导出名（本仓库页面均为具名导出，如 `export function DeparturesPage`）。route 的其它选项（`validateSearch`、`beforeLoad`、`path`）保持不变。

    // apps/web/src/app/router/index.tsx — target（保留这三处静态导入）
    import { AppLayout } from '@/layouts/AppLayout'
    import { LoginPage } from '@/pages/LoginPage'
    import { NotFoundPage } from '@/pages/NotFoundPage'

    // target：新增 lazyRouteComponent 导入，删除上面 12-24 行的 14 条业务页面静态导入
    import { lazyRouteComponent } from '@tanstack/react-router'

    // target：route 的 component 改为懒加载（逐个替换，其余选项不动）
    const indexRoute = createRoute({
      getParentRoute: () => appLayoutRoute,
      path: '/',
      component: lazyRouteComponent(() => import('@/pages/HomePage'), 'HomePage'),
    })

    const departureRoute = createRoute({
      getParentRoute: () => appLayoutRoute,
      path: '/departure',
      component: lazyRouteComponent(
        () => import('@/features/departure/pages/DeparturesPage'),
        'DeparturesPage',
      ),
    })

    // departureNewRoute / departureDetailRoute / financeTransactionsRoute /
    // financeVerificationRoute 保留各自的 validateSearch，仅把 component 换成：
    //   component: lazyRouteComponent(() => import('...'), 'XxxPage')

    // 全部需要改为懒加载的映射（component 值）：
    // '/'                       -> import('@/pages/HomePage'),                              'HomePage'
    // '/departure'              -> import('@/features/departure/pages/DeparturesPage'),      'DeparturesPage'
    // '/departure/new'          -> import('@/features/departure/pages/CreateDeparturePage'), 'CreateDeparturePage'
    // '/departure/$departureId' -> import('@/features/departure/pages/DepartureDetailPage'), 'DepartureDetailPage'
    // '/finance/receivable'     -> import('@/features/finance/pages/ReceivablesPage'),       'ReceivablesPage'
    // '/finance/payable'        -> import('@/features/finance/pages/PayablesPage'),          'PayablesPage'
    // '/finance/transactions'   -> import('@/features/finance/pages/TransactionsPage'),      'TransactionsPage'
    // '/finance/verification'   -> import('@/features/finance/pages/VerificationsPage'),     'VerificationsPage'
    // '/partner'                -> import('@/features/partner/pages/PartnersPage'),          'PartnersPage'
    // '/partner/$partnerId'     -> import('@/features/partner/pages/PartnerDetailPage'),     'PartnerDetailPage'
    // '/supplier'               -> import('@/features/supplier/pages/SuppliersPage'),        'SuppliersPage'
    // '/supplier/$supplierId'   -> import('@/features/supplier/pages/SupplierDetailPage'),   'SupplierDetailPage'
    // '/system/organization'    -> import('@/pages/system/OrganizationPage'),               'OrganizationPage'
    // '/system/users'           -> import('@/pages/system/EmployeesPage'),                  'EmployeesPage'

    // apps/web/src/app/router/index.tsx:211 — target（补 pending 占位）
    export const router = createRouter({
      routeTree,
      defaultPreload: 'intent',
      defaultPendingComponent: RoutePendingState,
    })

    // 新文件 apps/web/src/components/RoutePendingState.tsx — target
    import { Spin } from 'antd'

    export function RoutePendingState() {
      return (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 240,
          }}
        >
          <Spin />
        </div>
      )
    }

## Repo conventions to follow

- 占位组件放 `apps/web/src/components/`，具名导出、函数组件（对齐 `apps/web/src/components/DepartureDetailShellSkeleton.tsx`）。
- 保留 `@/` 别名与现有 import 分组顺序。
- 不改任何 route 的 `path`、`validateSearch`、`beforeLoad`；`defaultPreload: 'intent'` 保留，配合懒加载可在 hover 时预取对应 chunk。

## Steps

1. 新建 `apps/web/src/components/RoutePendingState.tsx`（见 Target）。
2. 在 `apps/web/src/app/router/index.tsx` 删除 12-24 行的 14 条业务页面静态导入，改为 `import { lazyRouteComponent } from '@tanstack/react-router'` 并加入 `import { RoutePendingState } from '@/components/RoutePendingState'`；保留 `AppLayout`、`LoginPage`、`NotFoundPage` 静态导入。
3. 按 Target 的映射，把 14 个受保护 route（含 index）以及带 `validateSearch` 的 4 个 route 的 `component` 逐个替换成 `lazyRouteComponent(() => import(...), 'XxxPage')`，其它选项一字不动。`loginRoute` 保持静态 `LoginPage`。
4. 在 `createRouter` 补 `defaultPendingComponent: RoutePendingState`。
5. `pnpm --filter web build` 后确认 `dist/assets` 产出多个按页面拆分的 chunk（而非单一大 chunk）。
6. 重新阅读 diff，确认无 route 行为改动、无遗留未用导入。

## Boundaries

- Do NOT 懒加载 `LoginPage`、`AppLayout`、`NotFoundPage`（外壳/首帧必需，懒加载收益低且增加闪烁）。
- Do NOT 改动任何 `validateSearch` / `beforeLoad` / `path` / 路由树结构。
- Do NOT 顺手改 `vite.config.ts` 的 `manualChunks`（本计划仅做路由级分割；vendor 分包如需另立计划）。
- Do NOT 新增依赖或修改页面组件自身。
- 若与计划 014 同期执行，`createRouter` 会同时含 `defaultErrorComponent` 与 `defaultPendingComponent`，两者互不冲突，注意合并时都保留。
- STOP if the code has drifted from commit `3876d55`；报告漂移而不是即兴修改。

## Verification

- **Mechanical**:
  - `pnpm --filter web typecheck`
  - `pnpm --filter web build`（成功且 `dist/assets` 出现按页面拆分的多个 JS chunk）
  - `pnpm --filter web test`
  - `npx react-doctor@latest --scope changed` 分数不下降。
- **Behavior check**: `pnpm --filter web dev`，打开浏览器 DevTools Network 面板，登录后停在 `/departure`，确认首屏未加载 finance/supplier/partner 详情页 chunk；点击进入「财务/核销」「供应商详情」等路由时，Network 出现对应新 chunk 且页面正常渲染，切换期间短暂显示 `Spin` 占位；hover 导航菜单（intent 预取）时对应 chunk 提前拉取。
- **Done when**: 业务页面按路由拆分为独立 chunk、首屏体积下降、导航与 `validateSearch` 深链行为不变、加载中有占位、各项检查通过且 React Doctor 分数不降。
