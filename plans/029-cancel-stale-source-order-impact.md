# 029 — 取消过期的客源单金额影响查询

- **Status**: DONE
- **Commit**: 9477cf7
- **Severity**: MEDIUM
- **Category**: Bugs & correctness
- **Rule**: Beyond the scan
- **Estimated scope**: 2–3 文件（`SourceOrdersTab.tsx`、service、测试）

## Problem

保存客源单且金额路径变更时，`submitSourceOrder` 会 `await getGuestCollectionChangeImpact(editingOrder.id)`，无 AbortSignal / 世代校验。请求飞行中若关闭抽屉、切换编辑单或再次提交，仍可能用过期 `editingOrder`/`payload` 弹出 `Modal.confirm` 并 `saveMutation.mutateAsync`。

```214:260:apps/web/src/features/departure/components/SourceOrdersTab.tsx
  const submitSourceOrder = async (payload: ReturnType<typeof formValuesToPayload>) => {
    const editingOrder = drawer.editingOrder
    ...
    const impact = await getGuestCollectionChangeImpact(editingOrder.id)
    if (impact.affectedTransactionCount <= 0) {
      saveMutation.mutate(payload)
      return
    }

    Modal.confirm({
      ...
      onOk: () => saveMutation.mutateAsync(payload),
    })
  }
```

```106:112:apps/web/src/services/source-order.service.ts
export async function getGuestCollectionChangeImpact(
  sourceOrderId: string,
): Promise<GuestCollectionChangeImpact> {
  return request.get<GuestCollectionChangeImpact>(
    `/source-orders/${sourceOrderId}/guest-collection-change-impact`,
  )
}
```

Exemplar：计划 006（`useCopyFromDepartureSearch` 取消过期复制流）——请求世代 + 取消后再做副作用。

## Target

1. Service 接受可选 `signal`：

```tsx
export async function getGuestCollectionChangeImpact(
  sourceOrderId: string,
  signal?: AbortSignal,
): Promise<GuestCollectionChangeImpact> {
  return request.get<GuestCollectionChangeImpact>(
    `/source-orders/${sourceOrderId}/guest-collection-change-impact`,
    { signal },
  )
}
```

2. 在 `SourceOrdersTab` 用 ref 保存 `AbortController` + 提交世代（`editingOrder.id`）：

```tsx
const impactAbortRef = useRef<AbortController | null>(null)

const submitSourceOrder = async (payload: ...) => {
  const editingOrder = drawer.editingOrder
  if (!editingOrder) {
    saveMutation.mutate(payload)
    return
  }
  // ... pathChanged 短路不变 ...

  impactAbortRef.current?.abort()
  const controller = new AbortController()
  impactAbortRef.current = controller
  const requestOrderId = editingOrder.id

  let impact
  try {
    impact = await getGuestCollectionChangeImpact(requestOrderId, controller.signal)
  } catch (error) {
    if (controller.signal.aborted) return
    throw error
  }

  // 抽屉已切走或编辑其它单：丢弃
  if (drawer.editingOrder?.id !== requestOrderId) {
    return
  }

  if (impact.affectedTransactionCount <= 0) {
    saveMutation.mutate(payload)
    return
  }

  Modal.confirm({
    ...
    onOk: () => {
      if (drawer.editingOrder?.id !== requestOrderId) return
      return saveMutation.mutateAsync(payload)
    },
  })
}
```

注意：`onOk` 里读到的 `drawer.editingOrder` 可能是闭包旧值——确认时用 `requestOrderId` 与「打开 confirm 时捕获的 payload」即可；若 tab 用 reducer，可在 `onOk` 前通过 ref `latestEditingOrderIdRef.current` 校验（render 中同步 `latestEditingOrderIdRef.current = drawer.editingOrder?.id`）。

关闭抽屉时 abort：在 `CLOSE_DRAWER` 路径或 `useEffect` 清理 `impactAbortRef.current?.abort()`。

## Repo conventions to follow

- axios `signal` 传法对齐 `listTransactions(..., signal)`（`TransactionsWorkspace.tsx:115-130`）。
- 扩展 `SourceOrdersTab.source-amount-change.test.tsx`：模拟慢 impact → 关抽屉/换单 → 不应再 `Modal.confirm` / mutate。

## Steps

1. `getGuestCollectionChangeImpact` 增加 `signal?`。
2. `submitSourceOrder` 加 abort + 世代校验；关抽屉 abort。
3. 更新/新增测试覆盖竞态。

## Boundaries

- Do NOT 改金额路径变更的产品文案与确认逻辑。
- Do NOT 重构整个 `SourceOrdersTab`（拆分见 036）。

## Verification

- **Mechanical**: typecheck + `SourceOrdersTab.source-amount-change.test.tsx` 通过。
- **Behavior**: 编辑客源单改代收金额 → 快速关闭再开另一单 → 不应弹出针对旧单的确认；正常路径仍弹出并保存。
- **Done when**: 竞态测试绿，手动路径无错单保存。
