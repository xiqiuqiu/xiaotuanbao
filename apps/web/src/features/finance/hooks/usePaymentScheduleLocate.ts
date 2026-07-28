import { useEffect, useState } from 'react'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { matchesSegmentResourceSchedule } from '@/features/departure/utils/matches-segment-resource-schedule'
import { matchesSourceOrderSchedule } from '@/features/departure/utils/matches-source-order-schedule'
import type {
  DueDateRange,
  PaymentScheduleStatusFilter,
} from '../components/PaymentScheduleFilters'

/** Matches `.locateFlash` duration in PaymentScheduleWorkspace.module.css. */
const LOCATE_FLASH_MS = 480

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
  statusFilter?: PaymentScheduleStatusFilter,
  dueDateRange?: DueDateRange,
  sourceOrderId?: string,
) => PaymentScheduleSummary[]

type UsePaymentScheduleLocateOptions = {
  highlightSourceOrderId?: string
  highlightSegmentResourceId?: string
  onHighlightConsumed?: () => void
  isLoading: boolean
  isFetching: boolean
  schedulesResult?: { items: PaymentScheduleSummary[] }
  keyword: string
  statusFilter?: PaymentScheduleStatusFilter
  dueDateRange?: DueDateRange
  pageSize: number
  filterSourceOrderId?: string
  applyClientFilters: ApplyClientFilters
}

/**
 * One-shot row locate: derive target page + flash during render when data is ready,
 * then clear flash via timeout + onHighlightConsumed. Caller applies `pendingPage`
 * with its own setState during render.
 */
export function usePaymentScheduleLocate({
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
  filterSourceOrderId,
  applyClientFilters,
}: UsePaymentScheduleLocateOptions) {
  // Receivable locate is always by source order; payable may be segment resource
  // (供应商资源) or source order (客源返利). Prefer source-order when both set.
  const locateSourceOrderId = highlightSourceOrderId
  const locateSegmentResourceId = highlightSourceOrderId
    ? undefined
    : highlightSegmentResourceId
  const highlightId = locateSourceOrderId ?? locateSegmentResourceId

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
      filterSourceOrderId,
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
      setPendingPage(null)
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
