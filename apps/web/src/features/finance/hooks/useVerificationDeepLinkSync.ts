import { useEffect, useRef, type Dispatch } from 'react'
import type {
  VerificationDeepLinkLock,
  VerificationDeepLinkSearch,
} from '../utils/verification-list-deep-link'
import type { VerificationListAction } from '../utils/verification-list-state'

/**
 * Keeps the verification list filters in sync with the URL deep link.
 *
 * - key 变为非空（进入/切换深链）→ 应用精确锁定筛选。
 * - key 从非空变为空（如浏览器后退到干净 URL）且仍处于锁定态 → 复位默认筛选，
 *   使 URL 与列表口径一致。手动编辑单号时 reducer 已先把 `lock` 置 null，
 *   且此路径下 key 未跳变，因此不会误触发复位、不会重放深链覆盖用户输入。
 */
export function useVerificationDeepLinkSync({
  currentDeepLinkKey,
  deepLinkSearch,
  lock,
  dispatchList,
}: {
  currentDeepLinkKey: string
  deepLinkSearch: VerificationDeepLinkSearch | undefined
  lock: VerificationDeepLinkLock
  dispatchList: Dispatch<VerificationListAction>
}) {
  const prevDeepLinkKeyRef = useRef(currentDeepLinkKey)

  useEffect(() => {
    const prevKey = prevDeepLinkKeyRef.current
    if (prevKey === currentDeepLinkKey) {
      return
    }
    prevDeepLinkKeyRef.current = currentDeepLinkKey

    if (currentDeepLinkKey) {
      dispatchList({ type: 'applyDeepLink', search: deepLinkSearch ?? {} })
      return
    }
    if (prevKey && lock) {
      dispatchList({ type: 'resetFilters' })
    }
  }, [currentDeepLinkKey, deepLinkSearch, lock, dispatchList])
}
