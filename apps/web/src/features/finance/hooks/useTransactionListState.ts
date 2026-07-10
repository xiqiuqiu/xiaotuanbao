import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { TransactionDirection } from '@xiaotuanbao/shared'
import { applyTransactionListDeepLink } from '../utils/transaction-list-deep-link'
import {
  createInitialTransactionListState,
  createTransactionListReducer,
} from '../utils/transaction-list-state'

type UseTransactionListStateOptions = {
  scope: 'global' | 'departure'
  initialDirection?: TransactionDirection
  deepLinkSearch?: {
    departureId?: string
    direction?: string
  }
}

export function useTransactionListState({
  scope,
  initialDirection,
  deepLinkSearch,
}: UseTransactionListStateOptions) {
  const isDepartureScope = scope === 'departure'
  const reducer = useMemo(() => createTransactionListReducer(scope), [scope])
  const [listState, dispatchList] = useReducer(reducer, undefined, () =>
    createInitialTransactionListState({
      scope,
      direction: isDepartureScope ? initialDirection : undefined,
    }),
  )
  const appliedDeepLinkKey = useRef<string | null>(null)
  const appliedDepartureDirectionKey = useRef<string | null>(null)

  useEffect(() => {
    if (isDepartureScope || !deepLinkSearch) {
      return
    }
    const deepLink = applyTransactionListDeepLink(deepLinkSearch)
    if (!deepLink) {
      appliedDeepLinkKey.current = null
      return
    }
    const key = [deepLink.departureFilter, deepLink.direction ?? ''].join('|')
    if (appliedDeepLinkKey.current === key) {
      return
    }
    appliedDeepLinkKey.current = key
    dispatchList({ type: 'applyDeepLink', value: deepLink })
  }, [deepLinkSearch, isDepartureScope])

  // Keep direction in sync when overview/header「查看流水」updates the URL while
  // this tab is already mounted (destroyOnHidden does not remount in that case).
  useEffect(() => {
    if (!isDepartureScope) {
      return
    }
    const key = initialDirection ?? ''
    if (appliedDepartureDirectionKey.current === key) {
      return
    }
    appliedDepartureDirectionKey.current = key
    dispatchList({ type: 'setDirection', value: initialDirection })
  }, [initialDirection, isDepartureScope])

  const clearDepartureDirectionKey = useCallback(() => {
    appliedDepartureDirectionKey.current = null
  }, [])

  return {
    listState,
    dispatchList,
    clearDepartureDirectionKey,
  }
}
