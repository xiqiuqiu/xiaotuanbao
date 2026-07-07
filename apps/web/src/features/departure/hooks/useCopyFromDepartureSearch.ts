import { useEffect, useRef } from 'react'
import { message } from 'antd'
import type { NavigateOptions } from '@tanstack/react-router'
import { getDeparture } from '@/services/departure.service'
import { listSegments } from '@/services/segment.service'
import type { TemplateCopyModalState } from '../components/CreateDepartureCopyModal'
import type { RouteStepValues } from '../utils/departure-wizard-form'

interface UseCopyFromDepartureSearchOptions {
  copyFrom?: string
  navigate: (options: NavigateOptions) => void
  setRouteValues: React.Dispatch<React.SetStateAction<RouteStepValues>>
  setCopyModalMode: React.Dispatch<React.SetStateAction<'template' | 'departure'>>
  setCopyModalValues: React.Dispatch<React.SetStateAction<TemplateCopyModalState>>
  setCopyModalOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export function useCopyFromDepartureSearch({
  copyFrom,
  navigate,
  setRouteValues,
  setCopyModalMode,
  setCopyModalValues,
  setCopyModalOpen,
}: UseCopyFromDepartureSearchOptions) {
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

        setRouteValues({
          mode: 'copy',
          routeName: departure.routeName,
          defaultDayCount: departure.dayCount,
          copyFromDepartureId,
          sourceDepartureNo: departure.departureNo,
          previewSegmentCount: segmentList.summary.segmentCount,
          previewResourceCount: segmentList.summary.resourceCount,
          copySegments: true,
          copyResources: true,
          copyReferencePrices: true,
        })
        setCopyModalMode('departure')
        setCopyModalValues({
          copySegments: true,
          copyResources: true,
          copyReferencePrices: true,
        })
        setCopyModalOpen(true)
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载源发团失败')
        navigate({ to: '/departure/new', search: {} })
      }
    })()
  }, [
    copyFrom,
    navigate,
    setCopyModalMode,
    setCopyModalOpen,
    setCopyModalValues,
    setRouteValues,
  ])
}
