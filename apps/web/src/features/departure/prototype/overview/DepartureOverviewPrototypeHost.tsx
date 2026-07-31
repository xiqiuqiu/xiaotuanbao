/**
 * PROTOTYPE host — three variants of departure overview stats,
 * switchable via ?variant= on /departure/$departureId?tab=overview.
 *
 * Question: 概览如何更清晰地呈现经营与资金进度，避免空态扁平、主次不清？
 *   A 强化主指标带
 *   B 损益纵轴 · 进度环
 *   C 报表清单 · 无卡片
 *
 * DEV 下切换条常驻（含「正式」），避免手拼 URL 失误。
 */
import { useCallback } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import type { DepartureDetail } from '@/types/api'
import {
  PrototypeSwitcher,
  type PrototypeVariantOption,
} from '@/components/prototype/PrototypeSwitcher'
import { DepartureOverviewStatsCards } from '../../components/DepartureOverviewStatsCards'
import { VariantA, VARIANT_A_NAME } from './VariantA'
import { VariantB, VARIANT_B_NAME } from './VariantB'
import { VariantC, VARIANT_C_NAME } from './VariantC'

const VARIANTS: PrototypeVariantOption[] = [
  { key: 'prod', label: '正式概览' },
  { key: 'A', label: VARIANT_A_NAME },
  { key: 'B', label: VARIANT_B_NAME },
  { key: 'C', label: VARIANT_C_NAME },
]

export function isOverviewPrototypeVariant(variant: unknown): boolean {
  return variant === 'A' || variant === 'B' || variant === 'C'
}

export function resolveOverviewSwitcherKey(variant: unknown): string {
  if (isOverviewPrototypeVariant(variant)) {
    return variant as string
  }
  return 'prod'
}

export function DepartureOverviewPrototypeHost({
  departure,
  animateEnter,
}: {
  departure: DepartureDetail
  animateEnter: boolean
}) {
  const navigate = useNavigate()
  const { departureId } = useParams({ strict: false })
  const search = useSearch({ strict: false })
  const current = resolveOverviewSwitcherKey(search.variant)

  const handleVariantChange = useCallback(
    (key: string) => {
      if (!departureId || import.meta.env.PROD) {
        return
      }
      const nextSearch = { ...search } as Record<string, unknown>
      if (key === 'prod') {
        delete nextSearch.variant
      } else {
        nextSearch.variant = key
      }
      if (!nextSearch.tab) {
        nextSearch.tab = 'overview'
      }
      void navigate({
        to: '/departure/$departureId',
        params: { departureId },
        search: nextSearch,
        replace: true,
      })
    },
    [departureId, navigate, search],
  )

  return (
    <>
      {current === 'A' ? <VariantA departure={departure} /> : null}
      {current === 'B' ? <VariantB departure={departure} /> : null}
      {current === 'C' ? <VariantC departure={departure} /> : null}
      {current === 'prod' ? (
        <DepartureOverviewStatsCards departure={departure} animateEnter={animateEnter} />
      ) : null}
      {!import.meta.env.PROD ? (
        <>
          <PrototypeSwitcher
            variants={VARIANTS}
            current={current}
            onChange={handleVariantChange}
          />
          <div
            aria-live="polite"
            style={{
              position: 'fixed',
              right: 16,
              bottom: 72,
              zIndex: 1099,
              padding: '6px 10px',
              borderRadius: 6,
              background: 'rgba(0,0,0,0.72)',
              color: '#fff',
              fontSize: 12,
              pointerEvents: 'none',
            }}
          >
            overview prototype · {current}
          </div>
        </>
      ) : null}
    </>
  )
}
