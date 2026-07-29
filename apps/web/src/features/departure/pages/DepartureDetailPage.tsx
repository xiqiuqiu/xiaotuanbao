import { useCallback } from 'react'
import { Button, Result } from 'antd'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { getDeparture } from '@/services/departure.service'
import { useAuthStore } from '@/app/store/auth.store'
import { DepartureDetailShellSkeleton } from '@/components/DepartureDetailShellSkeleton'
import { StaleDataAlert } from '@/components/StaleDataAlert'
import { canEditDeparture } from '../utils/departure-permission'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import { ApiError } from '@/lib/request/client'
import { DepartureHeader } from '../components/DepartureHeader'
import { DepartureDetailWorkspace } from '../components/DepartureDetailWorkspace'
import {
  isDepartureDetailTabKey,
  isDepartureDetailTabVisible,
  type DepartureDetailTabKey,
} from '../catalog'
import { invalidateDepartureDetailQueries } from '../utils/invalidate-departure-detail-queries'

const DEFAULT_TAB: DepartureDetailTabKey = 'overview'

export function DepartureDetailPage() {
  const { departureId } = useParams({ strict: false })
  const search = useSearch({ strict: false })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const menuKeys = useAuthStore((state) => state.menuKeys)
  const actionKeys = useAuthStore((state) => state.actionKeys)
  const canEdit = canEditDeparture(actionKeys)

  const requestedTab = isDepartureDetailTabKey(search.tab) ? search.tab : DEFAULT_TAB
  const activeTab = isDepartureDetailTabVisible(requestedTab, menuKeys)
    ? requestedTab
    : DEFAULT_TAB

  const {
    data: departure,
    isLoading,
    isError,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['departure', departureId],
    queryFn: () => getDeparture(departureId!),
    enabled: Boolean(departureId),
    ...operationalQueryOptions(),
  })

  const handleTabChange = (key: string) => {
    if (!departureId) {
      return
    }

    navigate({
      to: '/departure/$departureId',
      params: { departureId },
      search: {
        tab: key as DepartureDetailTabKey,
        ...(search.segmentId ? { segmentId: search.segmentId } : {}),
        ...(search.listReturn ? { listReturn: search.listReturn } : {}),
      },
      // Keep a single detail history entry so「返回」reaches the jump source.
      replace: true,
    })
  }

  const handleUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ['departure', departureId] })
    queryClient.invalidateQueries({ queryKey: ['departures'] })
  }

  const handleRefreshDetail = useCallback(() => {
    if (!departureId) {
      return
    }
    invalidateDepartureDetailQueries(queryClient, departureId)
    void refetch()
  }, [departureId, queryClient, refetch])

  if (!departureId) {
    return (
      <Result
        status="404"
        title="发团不存在"
        subTitle="缺少有效的发团编号。"
        extra={
          <Link to="/departure">
            <Button type="primary">返回发团列表</Button>
          </Link>
        }
      />
    )
  }

  if (!departure) {
    if (isLoading) {
      return <DepartureDetailShellSkeleton activeTab={activeTab} />
    }
    if (isError && !(error instanceof ApiError && error.code === 404)) {
      return (
        <Result
          status="error"
          title="发团详情加载失败"
          subTitle={error instanceof Error ? error.message : '请稍后重试'}
          extra={[
            <Button key="retry" type="primary" onClick={() => void refetch()}>
              重新加载
            </Button>,
            <Link key="back" to="/departure">
              <Button>返回发团列表</Button>
            </Link>,
          ]}
        />
      )
    }
    return (
      <Result
        status="404"
        title="发团不存在"
        subTitle="该发团可能已被删除或您无权访问。"
        extra={
          <Link to="/departure">
            <Button type="primary">返回发团列表</Button>
          </Link>
        }
      />
    )
  }

  return (
    <div>
      <StaleDataAlert
        isFetching={isFetching}
        isError={isError}
        hasData={Boolean(departure)}
        onRefresh={handleRefreshDetail}
      />
      <DepartureHeader departure={departure} canEdit={canEdit} onUpdated={handleUpdated} />

      <DepartureDetailWorkspace
        departure={departure}
        activeTab={activeTab}
        menuKeys={menuKeys}
        canEdit={canEdit}
        search={search}
        onTabChange={handleTabChange}
      />
    </div>
  )
}
