# 011 — 提取资源表格列配置

- **Status**: DONE
- **Commit**: b77379c
- **Severity**: MEDIUM
- **Category**: Maintainability & architecture
- **Rule**: react-doctor/no-giant-component
- **Estimated scope**: 2 files，约 90 行移动与聚焦测试

## Problem

`apps/web/src/features/departure/components/ExecutionResourcePane.tsx:73` 的 `ExecutionResourcePane` 同时负责四组 mutation、抽屉状态、查询失效、导航以及 87 行表格列配置，组件超过 300 行：

    // apps/web/src/features/departure/components/ExecutionResourcePane.tsx:216 — current
    const columns: ColumnsType<SegmentResourceSummary> = [
      { title: '资源种类', dataIndex: 'resourceKind', ... },
      { title: '对手方', dataIndex: 'counterpartyName', ... },
      { title: '资源项目', dataIndex: 'title', ... },
      { title: '资源金额', dataIndex: 'amountCents', ... },
      { title: '应付状态', dataIndex: 'payableStatus', ... },
      { title: '备注', dataIndex: 'notes', ... },
      { title: '操作', render: (_, record) => { /* four actions */ } },
    ]

列定义是稳定、可独立测试的展示边界；继续内嵌会让 mutation 与表格操作变更互相干扰。

## Target

按 canonical recipe 提取独立的 list/table section，不把网络和状态所有权隐藏进新抽象：

    // apps/web/src/features/departure/components/execution-resource-columns.tsx — target
    export type BuildExecutionResourceColumnsOptions = {
      mutationLocked: boolean
      generatingId?: string
      onEdit: (resource: SegmentResourceSummary, viewOnly: boolean) => void
      onViewPayables: (resource: SegmentResourceSummary) => void
      onGenerate: (resourceId: string) => void
      onDelete: (resourceId: string) => void
    }

    export function buildExecutionResourceColumns(
      options: BuildExecutionResourceColumnsOptions,
    ): ColumnsType<SegmentResourceSummary> {
      return [/* existing columns, exact labels, widths and action visibility */]
    }

    // ExecutionResourcePane.tsx — target
    const columns = buildExecutionResourceColumns({
      mutationLocked,
      generatingId: generateMutation.isPending ? generateMutation.variables : undefined,
      onEdit: openEdit,
      onViewPayables,
      onGenerate: (id) => generateMutation.mutate(id),
      onDelete: (id) => deleteMutation.mutate(id),
    })

Canonical fix要求提取 header/list/footer/side panel 等逻辑区，并抵制遮蔽数据流的过度拆分。本计划仅把纯列配置移出，查询和 mutations 仍由面板拥有。

## Repo conventions to follow

- 模仿 `apps/web/src/features/finance/components/payment-schedule-table-columns.tsx` 的 `build*Columns(options)` 结构。
- 保持 Ant Design `ColumnsType`、现有中文文案、列宽、固定列与权限可见性。
- 测试 seam 使用现有 `ExecutionResourcePane.actions.test.tsx` 的公开按钮交互。

## Steps

1. 新建 `execution-resource-columns.tsx`，逐字移动列配置与 `payableStatusTagColor`、`canGeneratePayable` 等纯展示 helper。
2. 通过显式 options 注入五个动作和 pending id；不得让列模块 import Query Client、service 或 Zustand。
3. `ExecutionResourcePane.tsx` 调用 builder，并保留查询、mutation、抽屉和 invalidate 所有权。
4. 扩充 `ExecutionResourcePane.actions.test.tsx`，覆盖查看/编辑、生成应付、查看应付、删除的可见性与回调；确保测试只经 DOM 行为观察。
5. 复查 diff，删除因移动产生的未使用 import，不重排无关代码。

## Boundaries

- Do NOT 改变任何操作权限、文案、列顺序或 mutation 行为。
- Do NOT 同时处理 `ExecutionTab`；由计划 010 独立负责。
- Do NOT 引入 `useMemo` 作为单纯消除诊断的手段。
- 若代码偏离 commit `b77379c`，停止并重新核验。

## Verification

- **Mechanical**:
  - `pnpm --filter web test -- ExecutionResourcePane.actions.test.tsx`
  - `pnpm --filter web typecheck`
  - `npx react-doctor@latest --verbose --scope changed` 不再对 `ExecutionResourcePane` 报 `no-giant-component`，且分数不回退。
- **Behavior check**: 在发团详情执行页逐一操作资源的查看、编辑、生成应付、查看应付、删除与批量生成；确认按钮权限、loading 与导航不变。用 Highlight updates 确认提取未造成额外重渲染。
- **Done when**: 诊断清除、聚焦测试/typecheck 通过、资源操作行为完全保持。
