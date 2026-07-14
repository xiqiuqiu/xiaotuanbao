# 006 — 取消过期的复制发团初始化

- **Status**: DONE
- **Commit**: b77379c
- **Severity**: MEDIUM
- **Category**: Bugs & correctness
- **Rule**: custom/async-race-and-stale-initialization
- **Estimated scope**: 3 files, about 90 lines including tests

## Problem

复制发团 hook 用单个 boolean 记住“已经初始化”，没有按 `copyFrom` ID 区分请求，也没有在参数变化或卸载时忽略旧 Promise。结果是：同一挂载期间切换复制源不会加载新源；旧请求较晚完成时还可能覆盖新源的路线状态、进入信息步骤，或在旧请求失败后执行过期导航。

    // apps/web/src/features/departure/hooks/useCopyFromDepartureSearch.ts:23 — current
    const copyFromInitialized = useRef(false)

    useEffect(() => {
      const copyFromDepartureId = copyFrom?.trim()
      if (!copyFromDepartureId || copyFromInitialized.current) {
        return
      }

      copyFromInitialized.current = true

      void (async () => {
        try {
          const [departure, segmentList] = await Promise.all([
            getDeparture(copyFromDepartureId),
            listSegments(copyFromDepartureId),
          ])
          // ...unconditionally writes state and navigates the wizard...
        } catch (error) {
          onLoadError?.()
          message.error(error instanceof Error ? error.message : '加载源发团失败')
          navigate({ to: '/departure/new', search: {} })
        }
      })()
    }, [copyFrom, enterInfoStep, navigate, onLoadError, setRouteValues])

调用端还传入了每次 render 都变化的 inline callback；如果直接移除 boolean guard，会让 effect 重复启动：

    // apps/web/src/features/departure/components/CreateDepartureWizard.tsx:79 — current
    useCopyFromDepartureSearch({
      copyFrom: copyFromId,
      navigate,
      setRouteValues,
      enterInfoStep,
      onLoadError: () => setInitializingStep2(false),
    })

## Target

这是 React Doctor “Beyond the scan” 异步竞态项，没有 canonical rule prompt。目标使用仓库现有 effect cleanup 模式：按规范化后的 ID 去重；每个 effect 建立 cancellation flag；任何 state、step、toast、navigate 副作用前先检查当前请求未取消。调用端先稳定 callback，避免无关 render 重启 effect。

    // apps/web/src/features/departure/components/CreateDepartureWizard.tsx — target
    const handleCopyLoadError = useCallback(() => {
      setInitializingStep2(false)
    }, [])

    useCopyFromDepartureSearch({
      copyFrom: copyFromId,
      navigate,
      setRouteValues,
      enterInfoStep,
      onLoadError: handleCopyLoadError,
    })

    // apps/web/src/features/departure/hooks/useCopyFromDepartureSearch.ts — target
    import { useEffect, useRef } from 'react'

    export function useCopyFromDepartureSearch({
      copyFrom,
      navigate,
      setRouteValues,
      enterInfoStep,
      onLoadError,
    }: UseCopyFromDepartureSearchOptions) {
      const initializedCopyFromRef = useRef<string | null>(null)

      useEffect(() => {
        const copyFromDepartureId = copyFrom?.trim()
        if (!copyFromDepartureId || initializedCopyFromRef.current === copyFromDepartureId) {
          return
        }

        initializedCopyFromRef.current = copyFromDepartureId
        let cancelled = false

        void (async () => {
          try {
            const [departure, segmentList] = await Promise.all([
              getDeparture(copyFromDepartureId),
              listSegments(copyFromDepartureId),
            ])

            if (cancelled) {
              return
            }

            const nextRouteValues: RouteStepValues = {
              mode: 'copy',
              routeName: departure.routeName,
              defaultDayCount: departure.dayCount,
              copyFromDepartureId,
              sourceDepartureNo: departure.departureNo,
              previewSegmentCount: segmentList.summary.segmentCount,
              previewResourceCount: segmentList.summary.resourceCount,
            }
            setRouteValues(nextRouteValues)
            await enterInfoStep(nextRouteValues)
          } catch (error) {
            if (cancelled) {
              return
            }
            onLoadError?.()
            message.error(error instanceof Error ? error.message : '加载源发团失败')
            navigate({ to: '/departure/new', search: {} })
          }
        })()

        return () => {
          cancelled = true
        }
      }, [copyFrom, enterInfoStep, navigate, onLoadError, setRouteValues])
    }

## Repo conventions to follow

- 继续使用 `apps/web/src/features/departure/components/CreateDepartureWizard.tsx:43` 的 `useCallback` 风格稳定异步流程依赖。
- 测试复用 `apps/web/src/features/departure/components/CreateDepartureWizard.test.tsx:23` 的可变 `mockSearch`、deferred Promise、service mock 和 `QueryClient(retry: false)` harness。
- 保留现有 `message.error` 文案和回退到 `/departure/new` 的失败行为；只阻止已经过期的请求执行它们。

## Steps

1. 在 `CreateDepartureWizard.tsx:79` 前新增无依赖的 `handleCopyLoadError`，并用它替换 inline `onLoadError`。
2. 在 `useCopyFromDepartureSearch.ts:23` 将 boolean ref 改为保存最后启动的规范化 `copyFromDepartureId`。
3. 在 effect 启动请求后创建 `cancelled`，并返回 cleanup 将其设为 `true`。
4. 在 `Promise.all` 成功后、构造/写入 `nextRouteValues` 前检查 `cancelled`；在 catch 的 toast、回调和 navigate 前也检查。严格采用 Target，不尝试中断不支持 `AbortSignal` 的 service。
5. 在 `CreateDepartureWizard.test.tsx` 新增竞态回归测试：先以 `copyFrom=A` 启动 deferred 请求，rerender 为 `copyFrom=B` 并先 resolve B，再 resolve A；最终 UI 只能显示 B 的团号/路线，A 不得覆盖。
6. 再新增 stale-error 测试：A 请求启动后切到 B，B 成功后让 A reject；断言没有 A 的错误 toast，且 `mockNavigate` 未收到 `{ to: '/departure/new', search: {} }`。
7. 新增卸载测试：请求 pending 时 unmount 后 resolve/reject；断言没有状态更新、toast 或 navigate 副作用。
8. 重新阅读 diff，仅保留 hook、调用端 callback 和上述测试。

## Boundaries

- Do NOT 修改 `getDeparture`、`listSegments` service 签名或伪造 AbortSignal 支持。
- Do NOT 改复制业务字段、复制范围、团号预生成或创建 Mutation。
- Do NOT 让过期请求显示 toast、调用 `onLoadError`、写路线状态或导航。
- Do NOT 为同一个已初始化 ID 因普通 rerender 重复发请求。
- Do NOT 添加依赖。
- STOP if the code has drifted from commit `b77379c`; report the drift instead of improvising.

## Verification

- **Mechanical**:
  - `npx react-doctor@latest --scope changed` 不新增 effect/dependency 诊断且总分不下降。
  - `pnpm --filter web typecheck`
  - `pnpm --filter web test -- CreateDepartureWizard.test.tsx`
- **Behavior check**: 打开 `/departure/new?copyFrom=<A>`，在 A 加载完成前切换为 `<B>`；确认最终仅呈现 B 的“复制自发团”信息。让 A 随后成功或失败，页面不得回滚、弹旧错误或跳回新建页；正常单一复制源仍进入第二步。
- **Done when**: 新 ID 可重新初始化，旧请求成功/失败及卸载后的请求均无副作用，正常复制行为不变，聚焦测试、typecheck 与 React Doctor 均通过。
