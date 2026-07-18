# 022 — 用 useMemo 缓存执行资源表格列配置

- **Status**: TODO
- **Commit**: a712d4a
- **Severity**: MEDIUM
- **Category**: Performance
- **Rule**: Beyond the scan（rerender-dependencies / 每次 render 重建列）
- **Estimated scope**: 1 文件（`ExecutionResourcePane.tsx`），约 15 行

## Problem

执行资源面板每次 render 都重新构建 `columns`（且传入内联回调）：

```248:258:apps/web/src/features/departure/components/ExecutionResourcePane.tsx
  const columns = buildExecutionResourceColumns({
    mutationLocked,
    canEdit,
    generatingId: generateMutation.isPending ? generateMutation.variables : undefined,
    onEdit: openEdit,
    onViewPayables,
    onGenerate: (id) => generateMutation.mutate(id),
    onDelete: (id) => deleteMutation.mutate(id),
    onVoidPayable: (resource) => setVoidingResource(resource),
    onClosePayable: (resource) => setClosingResource(resource),
  })
```

任意 state 变化（抽屉开关、其它筛选等）都会得到新的 `columns` 引用，触发 Ant Design Table 重新 normalize 全列。同页 `SourceOrdersTab` 已用 `useMemo` 缓存列（exemplar 见下），本面板是唯一的不一致点。

**用户影响：** 发团「执行」Tab 的资源表；交互频繁时整表反复重算列，属可消除的渲染开销。

## Target

用 `useMemo` 包裹，并把真正影响列渲染的值纳入依赖。内联的 mutation 回调本身依赖稳定的 mutation 对象，可直接放入闭包，依赖数组列出会变化的量：

    // target — apps/web/src/features/departure/components/ExecutionResourcePane.tsx
    const columns = useMemo(
      () =>
        buildExecutionResourceColumns({
          mutationLocked,
          canEdit,
          generatingId: generateMutation.isPending ? generateMutation.variables : undefined,
          onEdit: openEdit,
          onViewPayables,
          onGenerate: (id) => generateMutation.mutate(id),
          onDelete: (id) => deleteMutation.mutate(id),
          onVoidPayable: (resource) => setVoidingResource(resource),
          onClosePayable: (resource) => setClosingResource(resource),
        }),
      [
        mutationLocked,
        canEdit,
        generateMutation.isPending,
        generateMutation.variables,
        openEdit,
        onViewPayables,
        generateMutation,
        deleteMutation,
        setVoidingResource,
        setClosingResource,
      ],
    )

> 说明：`generateMutation`/`deleteMutation` 与 `setVoidingResource`/`setClosingResource`（useState setter）引用稳定；`generateMutation.isPending`、`generateMutation.variables` 是实际触发列变化的量，必须入依赖以保证「生成中」态正确刷新。`openEdit`、`onViewPayables` 若非 `useCallback`，应确认其稳定性（`onViewPayables` 已是 `useCallback`，见 `:229`）。

## Repo conventions to follow

- 完全照 `SourceOrdersTab` 的写法：

```312:323:apps/web/src/features/departure/components/SourceOrdersTab.tsx
  const columns = useMemo(
    () =>
      buildSourceOrdersColumns({
        canEdit: editable,
        canGenerate: !readOnly,
        deleteMutation,
        generateMutation,
        onView,
        onEdit,
        onOpenGuests,
        onViewReceivables,
      }),
    [
```

- `ExecutionResourcePane.tsx:1` 目前只 `import { useCallback, useState } from 'react'`，需补 `useMemo`。
- 若 `openEdit` 不是 `useCallback`，本计划**不**顺手改它（避免扩大范围）；把它放进依赖即可，仍能减少与其无关的 state 变化导致的重算。

## Steps

1. `ExecutionResourcePane.tsx:1` 改为 `import { useCallback, useMemo, useState } from 'react'`。
2. 把 `:248` 的 `const columns = buildExecutionResourceColumns({...})` 改为上面的 `useMemo` 形式，依赖数组按 Target 填写。
3. 确认 `openEdit`、`onViewPayables` 的定义位置在此 `useMemo` 之前，避免 TDZ。
4. 复查 diff，确认「生成中」loading 态、删除/作废/关闭动作仍正常。

## Boundaries

- 不改 `buildExecutionResourceColumns` 实现与列语义。
- 不改 mutation 定义、不改 `openEdit`/`onViewPayables` 本身。
- 不新增依赖。

## Verification

- **Mechanical**:
  - `cd apps/web && pnpm test -- ExecutionResource` 与 `execution-resource-columns` 相关测试通过；`pnpm typecheck`。
  - `npx react-doctor@latest --scope changed` 分数不降。
- **Behavior check**（性能）：发团「执行」Tab 打开某段资源表，点「生成应付」——按钮进入「生成中」并在完成后恢复（依赖 `isPending`/`variables` 正确）；编辑/作废/关闭/查看应付动作均正常。用 React DevTools Profiler 对比改动前后：与列无关的 state 变化（如打开无关抽屉）不再让资源 Table 重算列。
- **Done when**：列在无关渲染时不再重建、各行为正常，测试/类型通过，分数不降。
