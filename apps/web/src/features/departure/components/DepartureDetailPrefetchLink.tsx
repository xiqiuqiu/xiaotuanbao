import type { ReactNode } from 'react'
import { Typography } from 'antd'
import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import type { DepartureSummary } from '@/types/api'
import { getDeparture } from '@/services/departure.service'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import nameLinkStyles from '@/layouts/TableNameLink.module.css'
import {
  encodeDepartureListReturn,
  toDepartureListReturnState,
  type DepartureListSearch,
} from '../utils/departure-list-search'

/** Exported for tests — list hover prefetches detail data, not route beforeLoad. */
export function DepartureDetailPrefetchLink({
  record,
  children,
  strong = false,
  listSearch,
}: {
  record: DepartureSummary
  children: ReactNode
  strong?: boolean
  /** When opening detail from the list, preserve filters for the back link. */
  listSearch?: DepartureListSearch
}) {
  const queryClient = useQueryClient()

  const prefetchDetail = () => {
    // Data-only prefetch. Disable route intent preload on this Link — that path
    // runs app-layout beforeLoad → /auth/me and never loads departure detail.
    void queryClient.prefetchQuery({
      queryKey: ['departure', record.id],
      queryFn: () => getDeparture(record.id),
      ...operationalQueryOptions(),
    })
  }

  return (
    <Link
      className={nameLinkStyles.nameLink}
      to="/departure/$departureId"
      params={{ departureId: record.id }}
      search={{
        tab: 'overview',
        ...(listSearch
          ? { listReturn: encodeDepartureListReturn(listSearch) }
          : {}),
      }}
      state={
        listSearch
          ? (toDepartureListReturnState(listSearch) as never)
          : undefined
      }
      preload={false}
      onMouseEnter={prefetchDetail}
      onFocus={prefetchDetail}
    >
      {strong ? (
        <Typography.Text strong style={{ color: 'inherit' }}>
          {children}
        </Typography.Text>
      ) : (
        children
      )}
    </Link>
  )
}
