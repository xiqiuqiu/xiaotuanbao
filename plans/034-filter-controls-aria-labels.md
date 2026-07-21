# 034 — 热路径筛选控件补齐 aria-label

- **Status**: DONE
- **Commit**: 9477cf7
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Rule**: Beyond the scan（control-has-associated-label）
- **Estimated scope**: 4 文件（各 `*Filters.tsx`）

## Problem

发团/财务热路径筛选条仅用 `placeholder`，无可见 label / `aria-label`。控件填值后，读屏常丢失可访问名。

涉及文件（当前 `*Filters*.tsx` 内几乎无 `aria-label`）：

- `apps/web/src/features/finance/components/TransactionFilters.tsx`（如 `:79` RangePicker、Select、Input.Search）
- `apps/web/src/features/finance/components/PaymentScheduleFilters.tsx`
- `apps/web/src/features/finance/components/VerificationFilters.tsx`
- `apps/web/src/features/departure/components/DepartureFilters.tsx`（如 `:81` 起）

示例：

```79:113:apps/web/src/features/finance/components/TransactionFilters.tsx
          <DatePicker.RangePicker
            allowClear
            placeholder={['交易日期起', '交易日期止']}
            ...
          />
          <Select
            allowClear
            placeholder="收支方向"
            ...
          />
          <Input.Search
            allowClear
            placeholder="往来对象"
            ...
          />
```

## Target

为每个可交互筛选控件增加稳定中文 `aria-label`（可与 placeholder 同义，不必加可见 Form.Item，以免大改布局）：

```tsx
// TransactionFilters — target 示例
<DatePicker.RangePicker
  allowClear
  aria-label="交易日期"
  placeholder={['交易日期起', '交易日期止']}
  ...
/>
<Select
  allowClear
  aria-label="收支方向"
  placeholder="收支方向"
  ...
/>
<Input.Search
  allowClear
  aria-label="往来对象"
  placeholder="往来对象"
  ...
/>
```

`DepartureFilters` / `PaymentScheduleFilters` / `VerificationFilters` 同理：发团类型、出团进度、状态、负责人、客源、出团日期、节点编号、往来对象、到期日、核销状态等。

RangePicker：用单个 `aria-label`（如「出团日期」）即可；若 antd 版本对双输入有额外要求，以可访问名为准。

## Repo conventions to follow

- 文案与现有 placeholder/产品用语一致（中文）。
- 不改筛选 state / URL sync。
- `CreateDepartureStepRoute` 里已有 `aria-label` 模式可仿。

## Steps

1. 四文件逐个控件补 `aria-label`。
2. 可选：对一个 Filters 组件加测试断言关键控件存在 `aria-label`。
3. 读屏或 Accessibility 面板抽查发团列表 + 流水列表。

## Boundaries

- Do NOT 为「好看」改成大面积可见 label 布局（除非 DESIGN.md 另有要求）——本计划只补可访问名。
- Do NOT 改 `SourceOrdersFilters` 除非同样缺 label（可顺手，非必须）。

## Verification

- **Mechanical**: typecheck。
- **Behavior**: Chrome Accessibility 树中，筛选控件在已选值时仍有名称（非「未命名」）。
- **Done when**: 上述四文件热路径控件均有 `aria-label`。
