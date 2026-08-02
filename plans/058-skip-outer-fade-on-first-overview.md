# 058 — 首次概览跳过外层 tabPaneEnter

- **Status**: DONE
- **Commit**: 341bdf6
- **Severity**: LOW
- **Category**: Cohesion
- **Estimated scope**: 1 TSX（+ 必要时测试）

## Problem

`DepartureDetailWorkspace` 每次 Tab 内容都包 `tabPaneEnter`；首次进概览时同时播外层 fade 与内层 `metricCardEnter`（含 stagger），双重入场发闷。

## Target

当 `activeTab === 'overview'` 且该 departure 尚未播过概览入场（`!animatedOverviewDepartureIds.current.has(departure.id)`）时，`wrapTabPane` **不**加 `tabPaneEnter`；其它 Tab 与二次进入概览仍加 fade。

实现建议：给 `wrapTabPane` 增加可选参数，或在 overview 分支直接条件 className。

## Repo conventions to follow

- `animateEnter={!animatedOverviewDepartureIds.current.has(departure.id)}` 已存在于同文件。
- 标记时机：现有 `useEffect` 在 `activeTab === 'overview'` 时 `add(departure.id)` — 保持不变。

## Steps

1. 改 `DepartureDetailWorkspace.tsx` overview 的 children 包装逻辑。
2. 若有 workspace/tab 测试依赖 class，更新断言。

## Boundaries

- Do NOT 改 StatsCards 动画本身。
- Do NOT 去掉其它 Tab 的 fade。

## Verification

- **Mechanical**: 相关 vitest；typecheck。
- **Feel check**: 首次进概览只有卡片 stagger；从其它 Tab 回概览有短 fade、无卡片再飞入。
- **Done when**: 首次 overview 根节点无 `tabPaneEnter`；二次进入有。
