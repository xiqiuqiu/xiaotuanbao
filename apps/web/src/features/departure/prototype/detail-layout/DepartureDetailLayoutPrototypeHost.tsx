/**
 * PROTOTYPE host — Three variants of departure detail navigation + execution layout.
 *
 * Question:
 * 1) 发团详情业务/财务 Tab 放哪里更便于操作？
 * 2) 执行安排如何拆开发团级资源（统一录入）与按日资源（酒店/门票）？
 *
 * - A 顶栏页签 · 「全程」伪日段
 * - B 业务/财务两级导航 · 横向日程轴
 * - C 窄图标轨 · 种类×日期矩阵
 * - D 混搭：A 顶栏 Tabs + B 执行安排（用户选定方向）
 *
 * Stub state is in-memory only; gated by ?variant= in DEV.
 */
import { useCallback, useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import type { DepartureDetail } from '@/types/api'
import { PrototypeSwitcher } from '@/components/prototype/PrototypeSwitcher'
import { createInitialExecutionState } from './mock-data'
import { VariantA, VARIANT_A_META } from './VariantA'
import { VariantB, VARIANT_B_META } from './VariantB'
import { VariantC, VARIANT_C_META } from './VariantC'
import { VariantD, VARIANT_D_META } from './VariantD'
import type { ProtoExecutionState, ProtoTabKey } from './types'
import { PROTO_TABS } from './types'

const VARIANTS = [
  VARIANT_A_META,
  VARIANT_B_META,
  VARIANT_C_META,
  VARIANT_D_META,
] as const
type VariantKey = (typeof VARIANTS)[number]['key']
const VARIANT_KEYS: ReadonlySet<string> = new Set(VARIANTS.map((item) => item.key))

function resolveVariant(raw: unknown): VariantKey {
  if (typeof raw === 'string' && VARIANT_KEYS.has(raw)) {
    return raw as VariantKey
  }
  return 'D'
}

function resolveTab(raw: unknown): ProtoTabKey {
  if (typeof raw === 'string' && PROTO_TABS.some((tab) => tab.key === raw)) {
    return raw as ProtoTabKey
  }
  return 'execution'
}

type DepartureDetailLayoutPrototypeHostProps = {
  departure: DepartureDetail
  /**
   * Standalone throwaway route (no auth / no real departure).
   * When set, ←→ and tab switches stay on this path.
   */
  standalonePath?: '/prototype/departure-detail-layout'
}

export function DepartureDetailLayoutPrototypeHost({
  departure,
  standalonePath,
}: DepartureDetailLayoutPrototypeHostProps) {
  const { departureId } = useParams({ strict: false })
  const search = useSearch({ strict: false })
  const navigate = useNavigate()
  const [execution, setExecution] = useState<ProtoExecutionState>(createInitialExecutionState)

  const variant = resolveVariant(search.variant)
  const activeTab = resolveTab(search.tab)

  const patchSearch = useCallback(
    (patch: { variant?: string; tab?: string }) => {
      const nextSearch = {
        tab: patch.tab ?? activeTab,
        variant: patch.variant ?? variant,
      }
      if (standalonePath) {
        navigate({
          to: standalonePath,
          search: nextSearch,
          replace: true,
        })
        return
      }
      if (!departureId) return
      navigate({
        to: '/departure/$departureId',
        params: { departureId },
        search: {
          ...nextSearch,
          ...(typeof search.listReturn === 'string' && search.listReturn
            ? { listReturn: search.listReturn }
            : {}),
        },
        replace: true,
      })
    },
    [activeTab, departureId, navigate, search.listReturn, standalonePath, variant],
  )

  const onVariantChange = useCallback(
    (key: string) => patchSearch({ variant: key }),
    [patchSearch],
  )

  const onTabChange = useCallback(
    (tab: ProtoTabKey) => patchSearch({ tab }),
    [patchSearch],
  )

  const onAddDepartureResource = useCallback(() => {
    const now = '2026-07-30 10:00'
    setExecution((prev) => ({
      ...prev,
      focus: 'departure',
      selectedSegmentId: null,
      departureResources: [
        ...prev.departureResources,
        {
          id: `dr-new-${Date.now()}`,
          kind: '其他',
          title: `原型新增全程资源 ${prev.departureResources.length + 1}`,
          supplier: '演示供应商',
          amountCents: 10000,
          scope: 'departure',
          notes: '原型备注',
          payableStatus: 'not_generated',
          createdAt: now,
          updatedAt: now,
        },
      ],
    }))
  }, [])

  const onAddSegmentResource = useCallback((segmentId?: string) => {
    const now = '2026-07-30 10:00'
    setExecution((prev) => {
      const targetId =
        segmentId ?? prev.selectedSegmentId ?? prev.segments[0]?.id
      if (!targetId) return prev
      return {
        ...prev,
        focus: 'segment',
        selectedSegmentId: targetId,
        segmentResources: [
          ...prev.segmentResources,
          {
            id: `sr-new-${Date.now()}`,
            kind: prev.segmentResources.length % 2 === 0 ? '酒店' : '门票',
            title: `原型新增按日资源 ${prev.segmentResources.length + 1}`,
            supplier: '演示供应商',
            amountCents: 8800,
            scope: 'segment',
            segmentId: targetId,
            notes: '原型备注',
            payableStatus: 'not_generated',
            createdAt: now,
            updatedAt: now,
          },
        ],
      }
    })
  }, [])

  // Keep departure in scope so host stays typed for both embedded / standalone mounts.
  void departure.departureNo

  return (
    <>
      {variant === 'A' && (
        <VariantA
          activeTab={activeTab}
          onTabChange={onTabChange}
          execution={execution}
          onExecutionChange={setExecution}
          onAddDepartureResource={onAddDepartureResource}
          onAddSegmentResource={onAddSegmentResource}
        />
      )}
      {variant === 'B' && (
        <VariantB
          activeTab={activeTab}
          onTabChange={onTabChange}
          execution={execution}
          onExecutionChange={setExecution}
          onAddDepartureResource={onAddDepartureResource}
          onAddSegmentResource={onAddSegmentResource}
        />
      )}
      {variant === 'C' && (
        <VariantC
          activeTab={activeTab}
          onTabChange={onTabChange}
          execution={execution}
          onExecutionChange={setExecution}
          onAddDepartureResource={onAddDepartureResource}
          onAddSegmentResource={onAddSegmentResource}
        />
      )}
      {variant === 'D' && (
        <VariantD
          activeTab={activeTab}
          onTabChange={onTabChange}
          execution={execution}
          onExecutionChange={setExecution}
          onAddDepartureResource={onAddDepartureResource}
          onAddSegmentResource={onAddSegmentResource}
        />
      )}

      <PrototypeSwitcher
        variants={[...VARIANTS]}
        current={variant}
        onChange={onVariantChange}
      />
    </>
  )
}

export function isDepartureDetailLayoutPrototypeActive(
  variant: unknown,
): boolean {
  if (import.meta.env.PROD) return false
  return typeof variant === 'string' && VARIANT_KEYS.has(variant)
}
