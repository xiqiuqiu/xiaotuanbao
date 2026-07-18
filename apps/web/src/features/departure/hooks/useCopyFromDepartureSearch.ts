import { useEffect, useLayoutEffect, useRef } from 'react'
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
  const navigateRef = useRef(navigate)
  const setRouteValuesRef = useRef(setRouteValues)
  const enterInfoStepRef = useRef(enterInfoStep)
  const onLoadErrorRef = useRef(onLoadError)

  useLayoutEffect(() => {
    navigateRef.current = navigate
    setRouteValuesRef.current = setRouteValues
    enterInfoStepRef.current = enterInfoStep
    onLoadErrorRef.current = onLoadError
  }, [enterInfoStep, navigate, onLoadError, setRouteValues])

  useEffect(() => {
    const copyFromDepartureId = copyFrom?.trim()
    if (!copyFromDepartureId) {
      return
    }

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
        setRouteValuesRef.current(nextRouteValues)
        await enterInfoStepRef.current(nextRouteValues)
      } catch (error) {
        if (cancelled) {
          return
        }
        onLoadErrorRef.current?.()
        message.error(error instanceof Error ? error.message : '加载源发团失败')
        navigateRef.current({ to: '/departure/new', search: {} })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [copyFrom])
}
