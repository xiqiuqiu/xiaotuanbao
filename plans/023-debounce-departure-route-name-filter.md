# 023 — 发团列表「路线名称」筛选加防抖

- **Status**: DONE
- **Commit**: a712d4a
- **Severity**: MEDIUM
- **Category**: Performance
- **Rule**: Beyond the scan
- **Estimated scope**: 1 文件（`DeparturesPage.tsx`），约 4 行；`DepartureFilters.tsx` 不改

## Problem

发团主列表的「路线名称」`Input` 逐键 `onChange` 直连 reducer，`state.routeName` 又直接进 `useQuery` 的 `queryKey`/`queryFn`，导致**每次击键都向服务端 refetch** 这张宽表（`scroll x` 很宽、列多）：

```71:77:apps/web/src/features/departure/components/DepartureFilters.tsx
        <Input
          allowClear
          placeholder="路线名称"
          style={{ width: 160 }}
          value={routeNameFilter}
          onChange={(event) => onRouteNameChange(event.target.value || undefined)}
        />
```

```138:159:apps/web/src/features/departure/pages/DeparturesPage.tsx
    queryKey: [
      'departures',
      state.keyword,
      state.routeName,
      ...
    ],
    queryFn: () =>
      listDepartures({
        keyword: state.keyword || undefined,
        routeName: state.routeName,
        ...
```

同页团号搜索用 `Input.Search` 提交式触发、财务模块普遍防抖，唯独此字段是逐键服务端 refetch 的 outlier。

**用户影响：** 主列表为高频页面；输入路线名时每键一个请求，抖动明显、浪费带宽与服务端。

## Target

在 `DeparturesPage` 里对 `state.routeName` 做防抖派生，`queryKey`/`queryFn` 改用防抖值；输入框仍受控于 `state.routeName`（即时回显）。

    // target — apps/web/src/features/departure/pages/DeparturesPage.tsx
    import { useDebouncedValue } from '@/hooks/useDebouncedValue'
    ...
    const debouncedRouteName = useDebouncedValue(state.routeName)
    ...
    queryKey: [
      'departures',
      state.keyword,
      debouncedRouteName,          // was: state.routeName
      state.departureType,
      ...
    ],
    queryFn: () =>
      listDepartures({
        keyword: state.keyword || undefined,
        routeName: debouncedRouteName,   // was: state.routeName
        ...

同时把参与 `listFilterKey`（`placeholderData` 用）里的 `state.routeName` 一并改为 `debouncedRouteName`，保持占位数据与实际查询同口径。

## Repo conventions to follow

- 复用 `@/hooks/useDebouncedValue`（与 `usePaymentScheduleWorkspace` 一致的防抖手法）。
- `DepartureFilters` 组件保持不变（输入仍受控于 `routeNameFilter=state.routeName`，逐键即时回显）。
- 若分页在筛选变化时需重置到第 1 页，确认现有 reducer 已在 `onRouteNameChange` 里处理；防抖只影响查询触发时机，不改分页语义。

## Steps

1. 在 `DeparturesPage.tsx` 顶部 import `useDebouncedValue`（若未导入）。
2. 在组件内、`useQuery` 之前新增 `const debouncedRouteName = useDebouncedValue(state.routeName)`。
3. 把 `queryKey` 中的 `state.routeName`（`:141`）与 `queryFn` 中的 `routeName: state.routeName`（`:155`）改为 `debouncedRouteName`。
4. 把 `listFilterKey` 数组（`:119` 区域）里参与拼接的 `state.routeName` 改为 `debouncedRouteName`（若存在）。
5. 复查 diff，确认输入回显即时、查询按防抖触发。

## Boundaries

- 不改 `DepartureFilters` 的输入控件与其它筛选字段。
- 不改团号搜索（`onSearch`）逻辑。
- 不改 reducer 结构与分页重置语义。
- 不新增依赖。

## Verification

- **Mechanical**:
  - `cd apps/web && pnpm test -- DeparturesPage` 通过；`pnpm typecheck`。
  - `npx react-doctor@latest --scope changed` 分数不降。
- **Behavior check**（性能，需 Network 面板）：在「路线名称」连续快速输入，Network **不应**每键一个 `departures` 请求，仅停顿后触发一次；输入框回显即时；筛选结果、分页正确。
- **Done when**：逐键不再 refetch、结果正确，测试/类型通过，分数不降。
