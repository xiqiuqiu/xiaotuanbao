# 016 — 打开核销抽屉时重置表单以应用 initialValues

- **Status**: DONE
- **Commit**: a712d4a
- **Severity**: HIGH
- **Category**: Bugs & correctness
- **Rule**: Beyond the scan（no-mirror-prop-effect 相关，表单实例复用陷阱）
- **Estimated scope**: 1 文件（`CreateVerificationDrawer.tsx`），约 8 行

## Problem

`CreateVerificationDrawer` 依赖父级传入的 `form` 实例 + `<Form initialValues>` + `destroyOnHidden` 来预填核销对象，但**未在打开时把 `initialValues` 写回表单**。已核对 antd 底层 `@rc-component/form@1.8.5`：

```79:95:node_modules/.pnpm/@rc-component+form@1.8.5_react-dom@19.2.7_react@19.2.7__react@19.2.7/node_modules/@rc-component/form/es/hooks/useForm.js
  setInitialValues = (initialValues, init) => {
    this.initialValues = initialValues || {};
    if (init) {
      let nextStore = merge(initialValues, this.store);
      // 仅对「非 preserve 且已卸载」的字段用 initialValues 覆盖
      this.prevWithoutPreserves?.map(({ key: namePath }) => {
        nextStore = setValue(nextStore, namePath, getValue(initialValues, namePath));
      });
      ...
```

字段默认 `preserve=true`（本抽屉未设 `preserve={false}`/`clearOnDestroy`）。因此重新挂载时 `merge(initialValues, this.store)` 让**上一次的旧值覆盖新 initialValues**：第二次打开核销会残留上个节点/流水的 `direction`、`paymentScheduleId`、`departureId`。

当前抽屉未 seed 表单：

    // apps/web/src/features/finance/components/CreateVerificationDrawer.tsx:1054 — current
    <Form
      form={form}
      layout="vertical"
      initialValues={state.initialValues}
      onFinish={handleSubmit}
      ...

打开入口也不 seed（只切换 state）：

    // apps/web/src/features/finance/hooks/usePaymentScheduleDialogs.ts:90 — current
    const openVerify = useCallback((schedule: PaymentScheduleSummary) => {
      setActiveSchedule(() => schedule)
      setVerifyOpen(true)
    }, [])

**用户影响：** 收付款节点「核销」、流水「核销」、全局「新增核销」是财务高频入口。会话内第二次及以后打开会预填**上一次**的对象。轻则 UI 不进入已匹配态、需手动重选；重则用户误以为已带入正确节点而对错误对象发起核销——财务正确性风险。

## Target

仿仓库既有正确模式 `TransactionFormDrawer.tsx:66-73`（打开时 effect 重置并写入表单）。在 `CreateVerificationDrawer` 组件内、`state` 之后新增一个 effect：

    // target — apps/web/src/features/finance/components/CreateVerificationDrawer.tsx
    useEffect(() => {
      if (!open) {
        return
      }
      form.resetFields()
      form.setFieldsValue(state.initialValues)
    }, [open, form, state.initialValues])

`form.resetFields()` 会把表单清回 `this.initialValues`，随后 `setFieldsValue(state.initialValues)` 显式写入，双保险覆盖被 preserve 的旧值。`state.initialValues` 已在 `useCreateVerificationDrawerState` 用 `useMemo` 按 `initialSchedule/initialTransaction/lockedDepartureId` 稳定化，依赖安全。

仓库参照 exemplar：

```66:73:apps/web/src/features/finance/components/TransactionFormDrawer.tsx
  useEffect(() => {
    if (!open) {
      return
    }

    form.resetFields()
    form.setFieldsValue(initialValues)
  }, [form, initialValues, open])
```

## Repo conventions to follow

- 用 `import { useEffect } from 'react'`（当前文件第 1 行只导入了 `useMemo, useState`，需补 `useEffect`）。
- effect 放在 `const state = useCreateVerificationDrawerState(...)` 之后、其它 `useMemo` 附近，保持 hook 顺序稳定。
- 不要改动 `<Form initialValues={state.initialValues}>`（首次挂载仍需它），只新增打开时的重置逻辑。
- 保留 `destroyOnHidden` 不变。

## Steps

1. `CreateVerificationDrawer.tsx:1` 把 `import { useMemo, useState } from 'react'` 改为 `import { useEffect, useMemo, useState } from 'react'`。
2. 在 `CreateVerificationDrawer` 函数体内、`const state = useCreateVerificationDrawerState({...})`（约 `:963-969`）之后，加入上面的 `useEffect`。
3. 复查 diff，确认没有引入无关改动；确认 `handleClose`/`afterOpenChange` 逻辑未被动到。

## Boundaries

- 不改父级 `openVerify`/`useForm` 创建方式，不改公共 props。
- 不新增依赖。
- 不改动预览（`previewValues`）逻辑与 `destroyOnHidden`。
- 若 `CreateVerificationDrawer` 已与 commit `a712d4a` 漂移（例如已存在打开 seed 逻辑），停止并报告。

## Verification

- **Mechanical**:
  - `cd apps/web && pnpm test -- CreateVerificationDrawer` 现有测试通过；`pnpm typecheck`。
  - `npx react-doctor@latest --scope changed` 不新增诊断、分数不降。
- **Behavior check**：从收付款列表对**节点 A**点「核销」，关闭；再对**节点 B**点「核销」——抽屉应显示 B 的往来对象/方向，且不残留 A 的预选。全局「新增核销」重复开关两次同样不残留上次选择。
- **Done when**：二次打开预填正确，测试/类型通过，React Doctor 分数不降。
