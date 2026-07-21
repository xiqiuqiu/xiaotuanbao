# 028 — 用 key / 打开事件重置流水表单，去掉全量 reset effect

- **Status**: DONE
- **Commit**: 9477cf7
- **Severity**: MEDIUM
- **Category**: Bugs & correctness
- **Rule**: react-doctor/no-reset-all-state-on-prop-change
- **Estimated scope**: 2–3 文件（`TransactionFormDrawer`、`TransactionActionDialogs`、可能的 open handler）

## Problem

`TransactionFormDrawer` 在 `open`/`initialValues` 变化时用 effect 清空全部本地状态并 `resetFields`：

```81:90:apps/web/src/features/finance/components/TransactionFormDrawer.tsx
  useEffect(() => {
    if (!open) {
      return
    }

    form.resetFields()
    form.setFieldsValue(initialValues)
    setLastSuggestedYuan(undefined)
    lastSuggestedSourceOrderIdRef.current = undefined
  }, [form, initialValues, open])
```

`form` 由父级 `Form.useForm` 持有；`destroyOnHidden` 只卸 Drawer 子树，不重建 FormInstance。再次打开时用户可能先看到上一笔/残留，再被 effect 纠正。父级未按 transaction id 挂 `key`（核销抽屉有 `key={verifyTransaction.id}`）：

```71:80:apps/web/src/features/finance/components/TransactionActionDialogs.tsx
      <TransactionFormDrawer
        open={drawerOpen}
        mode={drawerMode}
        editingTransaction={editingTransaction}
        loading={transactionLoading}
        form={transactionForm}
        lockedDepartureId={lockedDepartureId}
        onClose={onCloseTransaction}
        onSubmit={onSubmitTransaction}
      />
```

Canonical recipe（[no-reset-all-state-on-prop-change](https://www.react.doctor/prompts/rules/react-doctor/no-reset-all-state-on-prop-change.md)）：把 discriminator 提到上一层，用 `key` remount，而不是在 effect 里手清所有 state。

> 注意：计划 016 曾让核销抽屉**仿照**本文件的 reset effect。本计划只改流水抽屉以符合 RD；不要回改核销抽屉，除非另开计划。

## Target

1. 在 `TransactionActionDialogs` 为流水抽屉加 key，并在打开路径 seed 表单（事件里，不是子组件 effect）：

```tsx
// TransactionActionDialogs.tsx — target
<TransactionFormDrawer
  key={
    drawerMode === 'edit' && editingTransaction
      ? `edit-${editingTransaction.id}`
      : `create-${lockedDepartureId ?? 'global'}`
  }
  open={drawerOpen}
  ...
/>
```

2. 找到设置 `drawerOpen=true` / 切换 `editingTransaction` 的 handler（`TransactionsWorkspace` 或 dialogs 状态 hook），在**同一事件**中：

```tsx
transactionForm.resetFields()
transactionForm.setFieldsValue(
  mode === 'edit' && editingTransaction
    ? transactionToFormValues(editingTransaction)
    : lockedDepartureId
      ? { ...createEmptyTransactionFormValues(), departureId: lockedDepartureId }
      : createEmptyTransactionFormValues(),
)
```

（复用 drawer 内已有的 `transactionToFormValues` / `createEmptyTransactionFormValues`——可导出到 `transaction-form.ts` 若尚未导出。）

3. 删除 `TransactionFormDrawer` 内 81–90 的全量 reset effect；本地建议对照状态在 remount 时自然归零（若 032 已改为 ref，则在打开事件里 `ref.current = undefined` 或依赖 key remount）。

保留客源切换时改写金额的 effect（约 159–194）：那是产品既定行为（有 `TransactionFormDrawer.suggestion.test.tsx`），属 `no-adjust-state-on-prop-change` 的有意保留，**不要删**。

## Repo conventions to follow

- 核销抽屉的 `key={verifyTransaction.id}` 是 exemplar（同文件 `:88-90`）。
- 打开时 seed 表单放在事件 handler，对齐 React「You Might Not Need an Effect」。
- 保持现有 suggestion / counterparty 测试绿色。

## Steps

1. 导出或复用表单初始值工具函数，供父级 seed。
2. 父级 open/edit handler 内 `resetFields` + `setFieldsValue`。
3. `TransactionActionDialogs` 加 `key`。
4. 删除 drawer 内 open-seed effect；跑 `TransactionFormDrawer*.test.tsx`。

## Boundaries

- Do NOT 删除客源金额建议覆盖 effect（:159+）。
- Do NOT 改 `CreateVerificationDrawer` 的 016 effect（范围外）。
- Do NOT 改变表单字段 schema / 提交 payload。

## Verification

- **Mechanical**: React Doctor 清除 `TransactionFormDrawer` 的 `no-reset-all-state-on-prop-change`（及同 effect 触发的 `no-adjust-state-on-prop-change` 若指向 :88）；`pnpm --filter web typecheck`；相关 vitest。
- **Behavior**: 流水「新建」填一半关闭 → 再开应为空白/锁定发团默认值，无闪旧值；编辑 A 再编辑 B，字段立刻为 B。
- **Done when**: 诊断清除，上述交互无闪烁，suggestion 测试仍过。
