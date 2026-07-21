# 032 — lastSuggestedYuan 改为 useRef 避免无效重渲染

- **Status**: DONE
- **Commit**: 9477cf7
- **Severity**: MEDIUM
- **Category**: Performance
- **Rule**: react-doctor/rerender-state-only-in-handlers
- **Estimated scope**: 1 文件（`TransactionFormDrawer.tsx`）

## Problem

`lastSuggestedYuan` 只用在 handler/effect 里与当前金额对照，从不进入 JSX，却用 `useState`，每次建议更新都重绘整个抽屉。

```65:66:apps/web/src/features/finance/components/TransactionFormDrawer.tsx
  const [lastSuggestedYuan, setLastSuggestedYuan] = useState<number | undefined>()
  const lastSuggestedSourceOrderIdRef = useRef<string | undefined>(undefined)
```

```183:192:apps/web/src/features/finance/components/TransactionFormDrawer.tsx
    const currentYuan = form.getFieldValue('amountYuan') as number | undefined
    if (
      shouldReplaceSuggestedAmount({
        currentYuan,
        previousSuggestedYuan: lastSuggestedYuan,
      })
    ) {
      const nextYuan = centsToYuan(amountSuggestion.suggestedAmountCents)
      form.setFieldsValue({ amountYuan: nextYuan })
      setLastSuggestedYuan(nextYuan)
    }
```

Canonical recipe（[rerender-state-only-in-handlers](https://www.react.doctor/prompts/rules/react-doctor/rerender-state-only-in-handlers.md)）：`useState` → `useRef`，`ref.current = newValue`。

## Target

```tsx
// TransactionFormDrawer.tsx — target
const lastSuggestedYuanRef = useRef<number | undefined>(undefined)
const lastSuggestedSourceOrderIdRef = useRef<string | undefined>(undefined)

// open 重置（若 028 删除了 effect，则在 key remount 时自然为 undefined；
// 若仍有清理点，改为：）
lastSuggestedYuanRef.current = undefined

// suggestion effect 内：
shouldReplaceSuggestedAmount({
  currentYuan,
  previousSuggestedYuan: lastSuggestedYuanRef.current,
})
// ...
lastSuggestedYuanRef.current = nextYuan
// settled/covered 分支：
lastSuggestedYuanRef.current = undefined
```

从 effect 依赖数组移除 `lastSuggestedYuan`（改读 ref 后不应再列入 deps）。

## Repo conventions to follow

- 已有 `lastSuggestedSourceOrderIdRef` 同文件，命名对齐 `*Ref`。
- 保持 `TransactionFormDrawer.suggestion.test.tsx` 行为（建议替换/保留手改）。

## Steps

1. `useState` → `useRef`；替换所有 `setLastSuggestedYuan` / 读取点。
2. 清理 effect deps。
3. 与 028 协调：若 028 仍留清理逻辑，改为写 ref。

## Boundaries

- Do NOT 改 `shouldReplaceSuggestedAmount` 语义。
- 建议在 028 之后或同 PR 执行，避免冲突。

## Verification

- **Mechanical**: React Doctor 清除 `rerender-state-only-in-handlers`；suggestion 测试通过。
- **Behavior / Profiler**: 切换客源触发建议时，抽屉不因「仅更新对照值」而多余 commit（Highlight updates）；金额替换/保留手改逻辑不变。
- **Done when**: 诊断清除，测试绿。
