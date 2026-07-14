import type { CSSProperties } from 'react'
import { Alert, Button } from 'antd'
import { shouldShowManualRefreshPrompt } from '@/lib/query/stale-data-prompt'

type StaleDataAlertProps = {
  isFetching: boolean
  isError: boolean
  hasData: boolean
  onRefresh: () => void
  style?: CSSProperties
}

/**
 * Fallback when automatic refresh fails. Healthy auto-refresh paths stay silent.
 */
export function StaleDataAlert({
  isFetching,
  isError,
  hasData,
  onRefresh,
  style,
}: StaleDataAlertProps) {
  const visible = shouldShowManualRefreshPrompt({
    isFetching,
    isError,
    hasData,
  })

  if (!visible) {
    return null
  }

  return (
    <Alert
      type="info"
      showIcon
      title="自动更新失败，仍显示上次数据"
      style={{ marginBottom: 16, ...style }}
      action={
        <Button size="small" loading={isFetching} onClick={onRefresh}>
          重试
        </Button>
      }
    />
  )
}
