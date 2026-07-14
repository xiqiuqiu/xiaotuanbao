import { useEffect, useRef } from 'react'
import { message } from 'antd'
import type { NavigateOptions } from '@tanstack/react-router'
import { getDeparture } from '@/services/departure.service'
import { listSegments } from '@/services/segment.service'
import type { RouteStepValues } from '../utils/departure-wizard-form'

interface UseCopyFromDepartureSearchOptions {
  copyFrom?: string
  navigate: (options: NavigateOptions) => void
  setRouteValues: React.Dispatch<React.SetStateAction<RouteStepValues>>
  enterInfoStep: (routeValues: RouteStepValues) => void | Promise<void>
  onLoadError?: () => void
}

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
