# 039 — 发团抽屉保存成功世代守卫

- **Status**: DONE
- **Commit**: 2f24597
- **Severity**: HIGH
- **Category**: Bugs & correctness
- **Rule**: Beyond the scan
- **Estimated scope**: 3 files

## Problem

行程段 / 资源 / 客源单保存进行中可关抽屉再开另一对象；`onSuccess` 读最新 drawer 状态并无条件 `closeDrawer` / 导航，会关掉新抽屉或跳错段。

```179:212:apps/web/src/features/departure/components/ExecutionTab.tsx
    onSuccess: (saved) => {
      // uses latest editingSegment; always closeDrawer + navigateExecution
```

```240:243:apps/web/src/features/departure/components/ExecutionResourcePane.tsx
    onSuccess: () => {
      message.success(editingResource ? '资源已更新' : '资源已添加')
      closeDrawer()
```

```58:61:apps/web/src/features/departure/hooks/useSourceOrdersTabMutations.tsx
    onSuccess: () => {
      message.success(drawer.editingOrder ? '客源单已更新' : '客源单已添加')
      onCloseDrawer()
```

## Target

在 `mutationFn` 启动时捕获 `editingId`（create 为 `null`），与结果一并返回。`onSuccess`：文案与 cache seed 用捕获值；`invalidate` 始终执行；仅当 `currentEditingId === capturedEditingId` 时才 `closeDrawer` / `navigateExecution`。

```tsx
mutationFn: async (payload) => {
  const editingId = editingSegment?.id ?? null
  const saved = editingId
    ? await updateSegment(editingId, payload)
    : await createSegment(departure.id, payload)
  return { saved, editingId }
},
onSuccess: ({ saved, editingId }) => {
  // messages + seed from editingId
  invalidateSegments()
  if ((editingSegment?.id ?? null) !== editingId) return
  closeDrawer()
  navigateExecution(saved.id)
},
```

资源 / 客源单同型（客源单无 navigate）。

## Repo conventions to follow

- 对齐 `useSourceOrderSubmit` 的 `latestEditingOrderIdRef` 过期忽略思路。
- 不改 mutation 的 API 对外行为（仍 `mutate(payload)`）。

## Steps

1. 改 `ExecutionTab` saveMutation。
2. 改 `ExecutionResourcePane` saveMutation。
3. 改 `useSourceOrdersTabMutations` saveMutation。
4. 聚焦手测：保存中关抽屉再开另一对象，成功提示仍出现，新抽屉不被关掉。

## Boundaries

- Do NOT 改删除/生成应收 mutation。
- STOP if drawer 状态机已变。

## Verification

- **Mechanical**: typecheck；相关 vitest。
- **Behavior**: 上述竞态路径；正常保存仍关抽屉并（行程段）导航到新段。
- **Done when**: 竞态不再关错抽屉；正常路径不变。
