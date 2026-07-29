/**
 * PROTOTYPE host — Three variants of the 增收记录 tab, switchable via ?variant=.
 *
 * Question: 团内增收记录页签应以何种信息架构呈现？
 * - A 统计+表格+抽屉（完整字段一览，贴近现有后台）
 * - B 结算泳道推进（财务跟进主路径）
 * - C 类型优先录入台（计调「先定类型再登一笔」）
 *
 * Stub state is in-memory only; shareable via URL search param.
 */
import { useCallback, useState } from 'react'
import { Alert, Typography } from 'antd'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { PrototypeSwitcher } from '@/components/prototype/PrototypeSwitcher'
import { INITIAL_INCOME_RECORDS } from './mock-data'
import { VariantA, VARIANT_A_META } from './VariantA'
import { VariantB, VARIANT_B_META } from './VariantB'
import { VariantC, VARIANT_C_META } from './VariantC'
import type { IncomeRecord } from './types'

const VARIANTS = [VARIANT_A_META, VARIANT_B_META, VARIANT_C_META] as const
type VariantKey = (typeof VARIANTS)[number]['key']
const VARIANT_KEYS: ReadonlySet<string> = new Set(VARIANTS.map((item) => item.key))

function resolveVariant(raw: unknown): VariantKey {
  if (typeof raw === 'string' && VARIANT_KEYS.has(raw)) {
    return raw as VariantKey
  }
  return 'A'
}

export function IncomeRecordsPrototypeHost() {
  const { departureId } = useParams({ strict: false })
  const search = useSearch({ strict: false })
  const navigate = useNavigate()
  const [records, setRecords] = useState<IncomeRecord[]>(() =>
    INITIAL_INCOME_RECORDS.map((item) => ({ ...item })),
  )

  const variant = resolveVariant(search.variant)

  const onVariantChange = useCallback(
    (key: string) => {
      if (!departureId) return
      navigate({
        to: '/departure/$departureId',
        params: { departureId },
        search: {
          tab: 'incomeRecords',
          variant: key,
          ...(typeof search.listReturn === 'string' && search.listReturn
            ? { listReturn: search.listReturn }
            : {}),
        },
        replace: true,
      })
    },
    [departureId, navigate, search.listReturn],
  )

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="增收记录 UI 原型（throwaway）"
        description={
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            数据为内存 stub，刷新即重置。用底部切换条或 ← → 在 A/B/C 间切换；对比信息架构差异后选定方向再正式实现。
            当前方案：<Typography.Text code>{variant}</Typography.Text> · 内存记录{' '}
            <Typography.Text code>{records.length}</Typography.Text> 笔
          </Typography.Paragraph>
        }
      />
      {variant === 'A' && <VariantA records={records} onChange={setRecords} />}
      {variant === 'B' && <VariantB records={records} onChange={setRecords} />}
      {variant === 'C' && <VariantC records={records} onChange={setRecords} />}
      <PrototypeSwitcher
        variants={[...VARIANTS]}
        current={variant}
        onChange={onVariantChange}
      />
    </>
  )
}
