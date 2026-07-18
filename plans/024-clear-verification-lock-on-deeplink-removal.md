# 024 — 深链参数被清空（如浏览器后退）时解除核销列表锁定筛选

- **Status**: DONE
- **Commit**: a712d4a
- **Severity**: MEDIUM（置信度中：属边界一致性问题，落地前务必按 Behavior check 双向验证）
- **Category**: Bugs & correctness
- **Rule**: Beyond the scan
- **Estimated scope**: 1 文件（`VerificationsWorkspace.tsx`），约 12 行

## Problem

核销列表的深链 effect 仅在 `currentDeepLinkKey` 非空时应用；当 URL 的 `transactionNo`/`scheduleNo` 被清掉（典型是**浏览器后退**、或分享的干净链接）时直接 `return`，不重置带 `lock` 的筛选态：

```242:247:apps/web/src/features/finance/components/VerificationsWorkspace.tsx
  useEffect(() => {
    if (!currentDeepLinkKey) {
      return
    }
    dispatchList({ type: 'applyDeepLink', search: deepLinkSearch ?? {} })
  }, [currentDeepLinkKey, deepLinkSearch])
```

`applyDeepLink` 会把状态设成 `lock: 'transactionNo' | 'scheduleNo'` 且精确匹配（`verification-list-deep-link.ts:46-68`、`verification-list-state.ts:94-95`）。

**关键约束（勿破坏）：** 用户在**锁定态**下手动编辑单号时，handler 已同步解锁并清 URL：

```358:376:apps/web/src/features/finance/components/VerificationsWorkspace.tsx
  const handleTransactionNoChange = useCallback(
    (value: string) => {
      dispatchList({ type: 'setTransactionNo', value })   // reducer 内 lock: null
      if (lock) {
        syncDeepLinkSearch({})                            // 清 URL 参数
      }
    },
    [lock, syncDeepLinkSearch],
  )
```

即：**手动编辑**时 `lock` 会**先被 reducer 置 null**，随后 URL 才变空。因此可用 `lock` 区分「用户主动清空（lock 已为 null）」与「后退导致 URL 变空但状态仍锁定（lock 非 null）」。

**用户影响：** 从流水/节点「查看核销」进入后按浏览器后退，URL 已无筛选参数，但列表仍停留在精确锁定的旧单号口径，URL 与列表不一致；全局核销页与发团核销 Tab 均为共享入口。

## Target

用 ref 记录上一个 deep-link key，检测「非空 → 空」的跳变；仅当此时 `lock` 仍非 null（说明不是用户主动编辑触发）才重置筛选：

    // target — apps/web/src/features/finance/components/VerificationsWorkspace.tsx
    const prevDeepLinkKeyRef = useRef(currentDeepLinkKey)
    useEffect(() => {
      const prevKey = prevDeepLinkKeyRef.current
      prevDeepLinkKeyRef.current = currentDeepLinkKey

      if (currentDeepLinkKey) {
        dispatchList({ type: 'applyDeepLink', search: deepLinkSearch ?? {} })
        return
      }
      // 深链参数被外部清空（如浏览器后退），而筛选仍处于锁定态 → 复位到默认筛选。
      // 用户在锁定态下手动编辑单号时，reducer 已先把 lock 置 null，这里不会误触发。
      if (prevKey && lock) {
        dispatchList({ type: 'resetFilters' })
      }
    }, [currentDeepLinkKey, deepLinkSearch, lock])

`resetFilters` 回到 `createDefaultVerificationListState(scope)`（清单号、清 lock、恢复默认日期窗口）。

> 备选：若产品希望「后退后仅解锁、保留已输入的单号做模糊匹配」，可改派 `setTransactionNo`/`setScheduleNo` 保留值并 `lock:null`，而非整表 `resetFilters`。默认采用 `resetFilters`（与 URL 干净态一致）。落地前若对期望行为不确定，STOP 并与需求方确认。

## Repo conventions to follow

- 复用现有 `resetFilters`/`applyDeepLink` action，不新增 reducer 分支。
- `useRef` 已在文件中使用（`useDebouncedValue` 等）；`react` 顶部 import 若无 `useRef` 需补。
- 保持 `handleTransactionNoChange`/`handleScheduleNoChange`/`handleResetFilters` 不变。

## Steps

1. 在该 effect 之前新增 `const prevDeepLinkKeyRef = useRef(currentDeepLinkKey)`（确认 `useRef` 已 import）。
2. 用 Target 的实现替换 `:242-247` 的 effect，依赖数组加入 `lock`。
3. 复查 diff，确认锁定态手动编辑、非锁定态手动输入、进入深链三条路径逻辑未变。

## Boundaries

- 不改锁定态手动编辑清 URL 的 handler。
- 不改 reducer 结构与 `applyDeepLink`/`resetFilters` 语义。
- 不改深链进入时的精确匹配行为。
- 不新增依赖。

## Verification

- **Mechanical**:
  - 新增聚焦测试（建议，仿 `FinanceWorkspaces.query-state.test.tsx`/`PaymentScheduleWorkspace.locate.test.tsx` 的 Parent 受控 search 模式）：
    - 进入 `?transactionNo=X` → 断言 lock 生效、精确匹配；把 search 改回 `{}`（模拟后退）→ 断言筛选被复位、lock 清除。
    - 锁定态下手动改单号 → 断言不被 effect 复位（保留用户输入、lock=null）。
  - `cd apps/web && pnpm test -- Verification` 通过；`pnpm typecheck`。
  - `npx react-doctor@latest --scope changed` 分数不降。
- **Behavior check**（务必双向）：
  1. 从流水/节点「查看核销」进入 → 列表锁定单号；点浏览器**后退** → 列表恢复默认筛选、与干净 URL 一致。
  2. 锁定态下在单号框改字 → 输入**保留**、正常按模糊匹配，未被清空。
  3. 未锁定态直接输入单号 → 行为不变。
- **Done when**：后退能解锁复位，且手动编辑/普通输入两条路径无回归，测试/类型通过，分数不降。

## Implementation notes（落地记录）

- 逻辑落在新 hook `hooks/useVerificationDeepLinkSync.ts`，而非直接内联进组件：内联 ~15 行会把 `VerificationsWorkspace` 组件推过 React Doctor 的 300 行阈值（原 296 行）触发 Maintainability 警告；抽 hook 后组件回落、`--scope changed` 100/100。行为与 Target 一致，复用现有 `applyDeepLink`/`resetFilters`，未新增 reducer 分支或依赖。
- 相比 Target 追加了 `if (prevKey === currentDeepLinkKey) return` 的**跳变判定**：因依赖数组新增 `lock`，手动编辑单号（`lock` 由 reducer 置 null）会触发 effect 重跑；此时 `navigate` 尚未把 URL 同步为空、`currentDeepLinkKey` 仍非空，若不判定 key 跳变会误重放深链、覆盖用户输入并重新锁定。跳变判定使「进入/切换深链」「后退清空」「手动编辑」三条路径互不干扰。
- 新增聚焦测试 `components/VerificationsWorkspace.deep-link.test.tsx`（Parent 受控 search）：进入锁定→精确匹配；清空深链→复位且清 lock；锁定态手动编辑→输入保留、转模糊匹配、未被复位。
