# 035 — 拆分 TransactionFormDrawer 巨型组件

- **Status**: DONE
- **Commit**: 9477cf7
- **Severity**: MEDIUM
- **Category**: Maintainability & architecture
- **Rule**: react-doctor/no-giant-component
- **Estimated scope**: 3–4 文件（抽屉 + 1–2 子组件/hook），行为保持

## Problem

`TransactionFormDrawer` 约 478 行，超过 300 行阈值，财务写路径中心，改动面大。

```50:50:apps/web/src/features/finance/components/TransactionFormDrawer.tsx
export function TransactionFormDrawer({
```

Canonical recipe（[no-giant-component](https://www.react.doctor/prompts/rules/react-doctor/no-giant-component.md)）：按逻辑区块抽子组件；数据获取可进 custom hook；避免模糊数据流的过度拆分。

Exemplar：计划 025 / 011（列配置外移）、010（行程段面板提取）。

## Target

在 **028、032 落地之后**再拆，避免与 reset/ref 改造冲突。建议最小拆分使主组件 <300 行：

1. **Hook** `useTransactionFormDrawerQueries.ts`（或同目录）：迁出 departures/partners/suppliers/sourceOrders/amountSuggestion 的 `useQuery` 与 `guestSuggestionEnabled`。
2. **Presentational** `TransactionFormDrawerFields.tsx`：纯 Form.Item 区块（方向、发团、往来、金额、渠道等 JSX），props 传入 options + form。

父组件保留：open/mode、建议 effect（或 032 后的 ref 逻辑）、提交/关闭。

```tsx
// 结构目标（示意）
export function TransactionFormDrawer(props) {
  const options = useTransactionFormDrawerQueries({ open, ... })
  useGuestAmountSuggestionEffect(...) // 若仍留在此
  return (
    <Drawer ...>
      <Form form={props.form} onFinish={...}>
        <TransactionFormDrawerFields ...options />
      </Form>
    </Drawer>
  )
}
```

## Repo conventions to follow

- 文件放 `apps/web/src/features/finance/components/`。
- 保持现有测试入口仍测 `TransactionFormDrawer` 导出（不必为每个子文件重写测试，除非抽取后行为易碎）。
- 不改 public props。

## Steps

1. 确认 028/032 已合并或同分支已完成。
2. 抽 queries hook → 再抽 Fields → 确认主文件 <300 行。
3. 跑 `TransactionFormDrawer*.test.tsx`。

## Boundaries

- Do NOT 改表单字段名、校验、提交 payload。
- Do NOT 借机做视觉改版。
- STOP if 行数已因 028 降到阈值下且 Doctor 不再报——报告即可，勿强行过度拆。

## Verification

- **Mechanical**: React Doctor 清除该文件 `no-giant-component`；typecheck；相关测试。
- **Behavior**: 新建/编辑流水、客源建议金额、锁定发团，行为与拆分前一致。
- **Done when**: 诊断清除，测试绿，props API 不变。
