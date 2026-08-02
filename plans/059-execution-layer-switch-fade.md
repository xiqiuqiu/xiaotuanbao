# 059 — 执行层「按日/发团级」切换短 fade

- **Status**: DONE
- **Commit**: 341bdf6
- **Severity**: LOW
- **Category**: Missed opportunity
- **Estimated scope**: 1 CSS + 1 TSX + motion 测试

## Problem

换日程段有 `resourcePaneEnter` 100ms fade；`Segmented` 在「按日资源 / 发团级资源」间切换时内容瞬切，不对称。

## Target

两层 pane 根节点共用 `resourcePaneEnter`（或同名等价类），并在层切换时用 `key={layer}` 触发重挂载入场。时长/曲线与按日资源 pane 一致（含 056/057 落地后的 ease-out-quint 与 reduced-motion）。

## Repo conventions to follow

- Exemplar：`ExecutionTab.tsx` 已对 `selectedSegment.id` 使用 `key` + `resourcePaneEnter`

## Steps

1. 给 departure-layer 与 day-layer 内容外包一层带 `resourcePaneEnter` 且 `key={layer}` 的容器（注意不要破坏现有 scroll / Card 布局）。
2. 更新 `ExecutionTab.motion-css.test.ts` 若需覆盖层切换（可选；CSS 类已存在则可只做结构）。

## Boundaries

- Do NOT 新增第二套 keyframes。
- Do NOT 改 Segmented API。

## Verification

- **Mechanical**: ExecutionTab layout / motion 测试。
- **Feel check**: 切换层级有与换日相同的短淡入。
- **Done when**: 两层切换均触发 `resourcePaneEnter`。
