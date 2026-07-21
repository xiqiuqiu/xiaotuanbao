# 041 — 工作台 DualAxes 模块懒加载

- **Status**: DONE
- **Commit**: 2f24597
- **Severity**: HIGH
- **Category**: Performance
- **Rule**: Beyond the scan
- **Estimated scope**: 1 file（HomePage.tsx）

## Problem

`HomePage` 静态 import 三个含 `@ant-design/plots` DualAxes 的模块，plots 打进工作台首包。

```45:48:apps/web/src/pages/HomePage.tsx
import { CoordinatorTrendModule } from './CoordinatorTrendModule'
import { FinanceMetricStrip, FinanceReceivablesModule } from './FinanceReceivablesModule'
import { OrganizationScaleModule } from './OrganizationScaleModule'
```

## Target

`React.lazy` + `Suspense`（骨架可用现有 Skeleton）动态加载：

- `CoordinatorTrendModule`
- `FinanceReceivablesModule` / `FinanceMetricStrip`（同 chunk：`import('./FinanceReceivablesModule')`）
- `OrganizationScaleModule`

`FinanceFundsModule` 等无 DualAxes 的保持静态。

```tsx
const CoordinatorTrendModule = lazy(() =>
  import('./CoordinatorTrendModule').then((m) => ({ default: m.CoordinatorTrendModule })),
)
```

## Steps

1. 改 HomePage imports 与 JSX 外包 Suspense。
2. 构建后确认 DualAxes 不在非图表模板首包（或 Network 按模板加载）。

## Boundaries

- Do NOT 改图表点击逻辑（027）。

## Verification

- typecheck；计调/财务/管理员工作台图表仍渲染；非对应模板不拉多余 plots chunk（尽力）。
