import { useEffect, useState, type CSSProperties } from 'react'
import { Alert, Button } from 'antd'
import {
  STALE_DATA_PROMPT_AFTER_MS,
  shouldShowStaleDataPrompt,
} from '@/lib/query/stale-data-prompt'

type StaleDataAlertProps = {
  dataUpdatedAt: number
  isFetching: boolean
  isError: boolean
  hasData: boolean
  onRefresh: () => void
  /** Optional override for tests / tighter surfaces. */
  stalePromptAfterMs?: number
  style?: CSSProperties
}

/**
 * Restrained freshness affordance: no always-on refresh button.
 * Appears only after a failed refresh or when the on-screen snapshot is old.
 */
export function StaleDataAlert({
  dataUpdatedAt,
  isFetching,
  isError,
  hasData,
  onRefresh,
  stalePromptAfterMs = STALE_DATA_PROMPT_AFTER_MS,
  style,
}: StaleDataAlertProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!hasData || isFetching) {
      return
    }
    const age = Date.now() - dataUpdatedAt
    const remaining = stalePromptAfterMs - age
    if (remaining <= 0) {
      setNow(Date.now())
      return
    }
    const timer = window.setTimeout(() => setNow(Date.now()), remaining)
    return () => window.clearTimeout(timer)
  }, [dataUpdatedAt, hasData, isFetching, stalePromptAfterMs])

  const visible = shouldShowStaleDataPrompt({
    now,
    dataUpdatedAt,
    isFetching,
    isError,
    hasData,
    stalePromptAfterMs,
  })

  if (!visible) {
    return null
  }

  return (
    <Alert
      type="warning"
      showIcon
      title={isError ? '数据刷新失败，当前可能不是最新' : '数据可能不是最新'}
      style={{ marginBottom: 16, ...style }}
      action={
        <Button size="small" loading={isFetching} onClick={onRefresh}>
          点击更新
        </Button>
      }
    />
  )
}
