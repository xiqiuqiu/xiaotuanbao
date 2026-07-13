import { useEffect, useState } from 'react'
import type { PaymentScheduleStatus, PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { matchesSegmentResourceSchedule } from '@/features/departure/utils/matches-segment-resource-schedule'
import { matchesSourceOrderSchedule } from '@/features/departure/utils/matches-source-order-schedule'
import type { DueDateRange } from '../components/PaymentScheduleFilters'

/** Two antd-Slow (0.3s) animation iterations. */
const LOCATE_FLASH_MS = 600

export function matchesLocateTarget(
  schedule: PaymentScheduleSummary,
  locateSourceOrderId?: string,
  locateSegmentResourceId?: string,
): boolean {
  if (locateSourceOrderId) {
    return matchesSourceOrderSchedule(schedule, locateSourceOrderId)
  }
  if (locateSegmentResourceId) {
    return matchesSegmentResourceSchedule(schedule, locateSegmentResourceId)
  }
  return false
}

type ApplyClientFilters = (
  items: PaymentScheduleSummary[],
  keyword: string,
  statusFilter?: PaymentScheduleStatus,
  dueDateRange?: DueDateRange,
) => PaymentScheduleSummary[]

type UsePaymentScheduleLocateOptions = {
  isReceivable: boolean
  highlightSourceOrderId?: string
  highlightSegmentResourceId?: string
  onHighlightConsumed?: () => void
  isLoading: boolean
  isFetching: boolean
  schedulesResult?: { items: PaymentScheduleSummary[] }
  keyword: string
  statusFilter?: PaymentScheduleStatus
  dueDateRange?: DueDateRange
  pageSize: number
  applyClientFilters: ApplyClientFilters
}

/**
 * One-shot row locate: derive target page + flash during render when data is ready,
 * then clear flash via timeout + onHighlightConsumed. Caller applies `pendingPage`
 * with its own setState during render.
 */
export function usePaymentScheduleLocate({
  isReceivable,
  highlightSourceOrderId,
  highlightSegmentResourceId,
  onHighlightConsumed,
  isLoading,
  isFetching,
  schedulesResult,
  keyword,
  statusFilter,
  dueDateRange,
  pageSize,
  applyClientFilters,
}: UsePaymentScheduleLocateOptions) {
  const highlightId = isReceivable ? highlightSourceOrderId : highlightSegmentResourceId
  const locateSourceOrderId = isReceivable ? highlightId : undefined
  const locateSegmentResourceId = !isReceivable ? highlightId : undefined

  const [locateFlashActive, setLocateFlashActive] = useState(false)
  const [locateStartedFor, setLocateStartedFor] = useState<string | null>(null)
  const [pendingPage, setPendingPage] = useState<number | null>(null)

  // Parent cleared the highlight prop — allow a future locate for the same id.
  if (!highlightId && locateStartedFor !== null) {
    setLocateStartedFor(null)
  }

  const canStartLocate =
    Boolean(highlightId) &&
    highlightId !== locateStartedFor &&
    !isLoading &&
    !isFetching &&
    Boolean(schedulesResult) &&
    !locateFlashActive

  if (canStartLocate && highlightId && schedulesResult) {
    const items = applyClientFilters(
      schedulesResult.items,
      keyword,
      statusFilter,
      dueDateRange,
    )
    const firstMatchIndex = items.findIndex((item) =>
      matchesLocateTarget(item, locateSourceOrderId, locateSegmentResourceId),
    )
    if (firstMatchIndex >= 0) {
      setPendingPage(Math.floor(firstMatchIndex / pageSize) + 1)
    }
    setLocateStartedFor(highlightId)
    setLocateFlashActive(true)
  }

  useEffect(() => {
    if (!locateFlashActive) {
      return
    }

    const clearFlashTimer = window.setTimeout(() => {
      setLocateFlashActive(false)
      setPendingPage(1)
      onHighlightConsumed?.()
    }, LOCATE_FLASH_MS)

    return () => {
      window.clearTimeout(clearFlashTimer)
    }
  }, [locateFlashActive, onHighlightConsumed])

  return {
    locateSourceOrderId,
    locateSegmentResourceId,
    locateFlashActive,
    pendingPage,
  }
}
