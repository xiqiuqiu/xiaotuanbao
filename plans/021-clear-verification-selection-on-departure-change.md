# 021 — 核销切换「关联发团」时清除已选流水/节点

- **Status**: DONE
- **Commit**: a712d4a
- **Severity**: MEDIUM
- **Category**: Bugs & correctness
- **Rule**: Beyond the scan
- **Estimated scope**: 2 文件（`useCreateVerificationDrawerState.ts`、`CreateVerificationDrawer.tsx`），约 10 行

## Problem

全局「新增核销」抽屉里，「关联发团」`Select` 无 `onChange` 联动，切换发团时不清除已选的流水/节点：

```262:269:apps/web/src/features/finance/components/CreateVerificationDrawer.tsx
          <Form.Item name="departureId" label="关联发团">
            <Select
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="可选，缩小候选范围"
              options={departureOptions}
              disabled={Boolean(lockedDepartureId)}
            />
```

对比只有换方向会清空选择：

```192:201:apps/web/src/features/finance/hooks/useCreateVerificationDrawerState.ts
  const handleDirectionChange = (nextDirection: VerificationDirection) => {
    form.setFieldsValue({
      direction: nextDirection,
      transactionId: '',
      paymentScheduleId: '',
      amountYuan: 0,
    })
    setTransactionSearchKeyword('')
    setScheduleSearchKeyword('')
  }
```

**用户影响：** 先选发团 A 并点选流水/节点，再改选发团 B 时，隐藏字段仍保留 A 的 `transactionId`/`paymentScheduleId`。此时 `selectedTransaction`/`selectedSchedule` 可能因不在 B 的候选中而变 `null`（提交被禁），UI 处于「像是选过、实则失效」的错乱态；边界情况下也可能残留跨团选择。全局「新增核销」路径中等频率。

## Target

在 hook 中新增 `handleDepartureChange` 并暴露；`Select` 上挂 `onChange`。因为 `Select` 位于 `Form.Item name="departureId"` 内，antd 会保留子元素自带的 `onChange` 并在其后同步表单值，故此 handler **只需清理依赖字段、不要再手动设 `departureId`**。

    // target — apps/web/src/features/finance/hooks/useCreateVerificationDrawerState.ts
    const handleDepartureChange = () => {
      form.setFieldsValue({
        transactionId: '',
        paymentScheduleId: '',
        amountYuan: 0,
      })
      setTransactionSearchKeyword('')
      setScheduleSearchKeyword('')
    }

    // 在 return 对象中追加：
    handleDepartureChange,

    // target — apps/web/src/features/finance/components/CreateVerificationDrawer.tsx:262
    <Form.Item name="departureId" label="关联发团">
      <Select
        allowClear
        showSearch={{ optionFilterProp: 'label' }}
        placeholder="可选，缩小候选范围"
        options={departureOptions}
        disabled={Boolean(lockedDepartureId)}
        onChange={state.handleDepartureChange}
      />

## Repo conventions to follow

- 命名与结构对齐既有 `handleDirectionChange`/`handleClearTransaction`（同 hook）。
- handler 通过 `state.` 暴露（该 Select 所在区块能访问 `state`；若当前该子区块以 props 传参，则把 `handleDepartureChange` 一并透传，参照相邻 `onDirectionChange` 的传递方式）。
- `allowClear` 清空时 antd 也会触发 `onChange`（value 为 undefined），一并清依赖字段，符合预期。

## Steps

1. 在 `useCreateVerificationDrawerState.ts` 的 `handleDirectionChange` 附近新增 `handleDepartureChange`（见 Target）。
2. 在该 hook 的 return 对象追加 `handleDepartureChange`。
3. 在 `CreateVerificationDrawer.tsx:262` 的发团 `Select` 上加 `onChange={state.handleDepartureChange}`；若该 Select 在子组件中渲染，则按现有 `onDirectionChange` 的透传路径把 handler 传进去。
4. 复查 diff，确认 `lockedDepartureId` 锁定时（Select disabled）不受影响。

## Boundaries

- 不改 `departureId` 的表单绑定/校验。
- 不改候选查询逻辑（依赖 `effectiveDepartureId` 自然重算）。
- 不新增依赖。

## Verification

- **Mechanical**:
  - `cd apps/web && pnpm test -- CreateVerification` 通过；`pnpm typecheck`。
  - `npx react-doctor@latest --scope changed` 分数不降。
- **Behavior check**：全局「新增核销」→ 选方向 → 选发团 A → 点选一条流水/节点 → 改选发团 B：流水/节点选择应被清空、金额归零、搜索框清空，候选列表切换到 B；`allowClear` 清空发团亦清空选择。锁定发团（从节点/流水进入）场景不受影响。
- **Done when**：切换发团不再残留旧选择，锁定场景无回归，测试/类型通过，分数不降。
