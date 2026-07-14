# 010 — 提取行程段导航面板

- **Status**: DONE
- **Commit**: b77379c
- **Severity**: MEDIUM
- **Category**: Maintainability & architecture
- **Rule**: react-doctor/no-giant-component
- **Estimated scope**: 2 files，约 100 行移动与少量测试补充

## Problem

`apps/web/src/features/departure/components/ExecutionTab.tsx:69` 的 `ExecutionTab` 从查询、URL 同步、抽屉与 mutation 一直负责到左右面板 JSX，函数体超过 300 行。行程段导航区本身已有清晰输入与行为边界，却仍内嵌在父组件中：

    // apps/web/src/features/departure/components/ExecutionTab.tsx:302 — current
    return (
      <div className={styles.workspace} ref={workspaceRef}>
        <Row className={styles.panes} gutter={16} wrap={false} align="stretch">
          <Col className={`${styles.paneCol} ${styles.segmentPaneCol}`} flex="280px">
            <Card title="行程段">
              {/* segment list, empty state, add action */}
            </Card>
          </Col>
          {/* resource pane and drawer */}
        </Row>
      </div>
    )

这是发团详情的核心执行工作区；导航、URL 同步或资源面板任一改动都需要穿过同一个巨型组件，增加回归风险。

## Target

按 canonical recipe，将独立逻辑区提取为聚焦子组件，保留数据获取与 URL/Mutation 所有权在 `ExecutionTab`，避免为满足行数而制造隐式状态：

    // apps/web/src/features/departure/components/ExecutionSegmentListPane.tsx — target
    export type ExecutionSegmentListPaneProps = {
      segments: ItinerarySegmentSummary[]
      selectedSegmentId: string | null
      mutationLocked: boolean
      onSelect: (segmentId: string) => void
      onEdit: (segment: ItinerarySegmentSummary) => void
      onCreate: () => void
    }

    export function ExecutionSegmentListPane(props: ExecutionSegmentListPaneProps) {
      // Own only the left Card, list rendering, selection markup and add action.
    }

    // apps/web/src/features/departure/components/ExecutionTab.tsx — target
    <ExecutionSegmentListPane
      segments={segments}
      selectedSegmentId={selectedSegmentId}
      mutationLocked={mutationLocked}
      onSelect={(id) => navigateExecution(id)}
      onEdit={openEdit}
      onCreate={openCreate}
    />

Canonical fix要求：识别 header/list/footer/side panel 等逻辑区并提取聚焦子组件；共享 fetching/effect 才提取 hook，避免遮蔽数据流的过度拆分。本计划仅提取左侧导航面板。

## Repo conventions to follow

- 遵循根 `DESIGN.md` 的 220px/64px shell、Ant Design Card/Button 和现有 CSS Module。
- 模仿 `apps/web/src/features/departure/components/ExecutionResourcePane.tsx:66` 的具名 Props 与具名导出方式。
- 保留 `ExecutionTab.module.css` 为样式唯一来源，不改视觉 token。
- 现有行为 seam：`ExecutionTab.layout.test.tsx`、`ExecutionTab.url-sync.test.tsx`、`ExecutionTab.create-select.test.tsx`。

## Steps

1. 新建 `ExecutionSegmentListPane.tsx`，移动左侧 `<Col>/<Card>`、`SegmentNavItem` 与相关 `theme.useToken()` 展示逻辑；不移动查询、effect、mutation 或导航状态。
2. 在 `ExecutionTab.tsx` 以显式 props 调用新组件，保持 `segmentListRef` 的滚动定位能力；如 ref 必须跨边界，使用 `forwardRef` 或把滚动 effect 与列表 DOM 一并移动，二选一后保持所有权一致。
3. 更新现有三个 `ExecutionTab.*.test.tsx` 的必要 mock/import，不改断言语义；增加一条公开交互测试证明选中行程段与添加按钮仍调用对应动作。
4. 复查 diff，确认没有文案、布局尺寸、URL search 或 mutation 行为变化。

## Boundaries

- Do NOT 改变 `ExecutionTabProps`、路由 search schema 或服务接口。
- Do NOT 同时重构资源面板；由计划 011 独立处理。
- Do NOT 新增状态管理、Context 或依赖。
- 若代码偏离 commit `b77379c`，停止并重新核验边界。

## Verification

- **Mechanical**:
  - `pnpm --filter web test -- ExecutionTab.layout.test.tsx ExecutionTab.url-sync.test.tsx ExecutionTab.create-select.test.tsx`
  - `pnpm --filter web typecheck`
  - `npx react-doctor@latest --verbose --scope changed` 不再对 `ExecutionTab` 报 `no-giant-component`，且分数不回退。
- **Behavior check**: 在发团详情「执行」Tab 切换行程段、滚动定位、添加/编辑行程段，确认 URL、选中态、左右面板与抽屉行为不变；用 React DevTools Highlight updates 确认提取后未额外扩大更新范围。
- **Done when**: 诊断清除、测试与 typecheck 通过、核心交互和布局无回归。
