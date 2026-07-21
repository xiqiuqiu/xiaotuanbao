# 026 — 修复列表 filter 切换时错误回显上一批数据

- **Status**: DONE
- **Commit**: 9477cf7
- **Severity**: HIGH
- **Category**: Bugs & correctness
- **Rule**: Beyond the scan
- **Estimated scope**: 2–9 文件（hook + 全部调用方 + 测试）

## Problem

`useListPlaceholderData` 用 `useEffect` 才把 `previousFilterKeyRef` 写成当前 `filterKey`。筛选项 A→B 时：

1. 首帧 `previous=A`，`keep=false`，`placeholderData=undefined`（正确清空）。
2. effect 提交后 `previous=B`。
3. 同一次 B 请求飞行中的后续渲染里 `keep=(B===B)=true`，突然变成 `keepPreviousData`，可能把 A 的行当作 B 的占位数据。

```46:55:apps/web/src/lib/query/list-query-ux.ts
export function useListPlaceholderData(filterKey: string) {
  const previousFilterKeyRef = useRef<string | undefined>(undefined)
  const keep = shouldKeepPreviousListData(previousFilterKeyRef.current, filterKey)

  useEffect(() => {
    previousFilterKeyRef.current = filterKey
  }, [filterKey])

  return keep ? keepPreviousData : undefined
}
```

注释写明「Filter transitions must clear rows」，与实现矛盾。调用方覆盖发团/应收/应付/流水/核销/客源/供应商/员工/平台组织等热路径列表。

现有单测只覆盖纯函数 `shouldKeepPreviousListData`，未覆盖 hook 在「filter 变更后、请求未完成前」的多次渲染。

## Target

**不要**在 `filterKey` 一变就 commit。只在「当前 filter 已拿到非 placeholder 的成功数据」时 commit，这样 B 首刷全程 `keep=false`，分页（同 filterKey）仍 `keep=true`。

```tsx
// apps/web/src/lib/query/list-query-ux.ts — target
import { useRef } from 'react'
import { keepPreviousData } from '@tanstack/react-query'

export function useListPlaceholderData(filterKey: string) {
  const settledFilterKeyRef = useRef<string | undefined>(undefined)
  const keep = shouldKeepPreviousListData(settledFilterKeyRef.current, filterKey)
  const placeholderData = keep ? keepPreviousData : undefined

  function commitListFilterKey(isSuccess: boolean, isPlaceholderData: boolean) {
    if (isSuccess && !isPlaceholderData) {
      settledFilterKeyRef.current = filterKey
    }
  }

  return { placeholderData, commitListFilterKey }
}
```

每个调用方在 `useQuery` 之后同步调用（render 内更新 ref 合法）：

```tsx
// exemplar 模式 — 每个列表调用方
const { placeholderData, commitListFilterKey } = useListPlaceholderData(listFilterKey)
const query = useQuery({ placeholderData, /* 原 queryKey/queryFn */ })
commitListFilterKey(query.isSuccess, query.isPlaceholderData)
```

须更新的调用方（grep `useListPlaceholderData`）：

- `apps/web/src/features/finance/components/TransactionsWorkspace.tsx`
- `apps/web/src/features/finance/components/VerificationsWorkspace.tsx`
- `apps/web/src/features/finance/hooks/usePaymentScheduleWorkspace.ts`
- `apps/web/src/features/departure/pages/DeparturesPage.tsx`
- `apps/web/src/features/partner/pages/PartnersPage.tsx`
- `apps/web/src/features/supplier/pages/SuppliersPage.tsx`
- `apps/web/src/pages/system/EmployeesPage.tsx`
- `apps/web/src/pages/platform/PlatformOrganizationsPage.tsx`

在 `list-query-ux.test.ts` 增加 hook 测试（`@testing-library/react` `renderHook`）：模拟 filter A 成功 commit → 切 B 且仍 `isSuccess=false` 时 `placeholderData` 为 `undefined` → B 成功后再分页同 filter 时为 `keepPreviousData`。

## Repo conventions to follow

- 保持 `shouldKeepPreviousListData` / `resolveListTableLoading` 语义与现有单测不变。
- 列表仍用 `listFilterKey` 排除 `page`/`pageSize`（见 `TransactionsWorkspace.tsx:78-90`）。
- 不要改 queryKey 结构，只改 placeholder 提交时机。

## Steps

1. 改 `useListPlaceholderData` 为返回 `{ placeholderData, commitListFilterKey }`，删除 effect。
2. 更新全部 8 个调用方解构与 `commitListFilterKey(...)`。
3. 补 hook 单测覆盖 filter 切换与分页两种路径。
4. 跑 `pnpm --filter web test` 中与 list-query / finance / departure 相关用例。

## Boundaries

- Do NOT 去掉分页 SWR（同 filter 下仍须 `keepPreviousData`）。
- Do NOT 改硬/软 loading 的 `resolveListTableLoading` 规则。
- STOP if API 已有其它包装；报告漂移。

## Verification

- **Mechanical**: `npx react-doctor@latest --scope changed` 分数不降；`pnpm --filter web typecheck`；相关 vitest 通过。
- **Behavior**: 财务流水或发团列表：改筛选项后表格先清空/硬加载，不得闪出上一筛选项的行；仅翻页时应保留上一页行并出现软加载提示。
- **Done when**: 上述行为成立，hook 测试覆盖 commit 时机，调用方全部迁移。
