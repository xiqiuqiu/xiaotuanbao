import { useState } from 'react'
import dayjs from 'dayjs'
import { DatePicker, Segmented, Space } from 'antd'
import { PaymentScheduleWorkspace } from '@/features/finance/components/PaymentScheduleWorkspace'
import type { DepartureDateRange } from '@/features/finance/components/PaymentScheduleFilters'
import { buildDepartureDateRangePresets } from '@/utils/dateRangePresets'
import { PartnerLedgerSummaryCards } from './PartnerLedgerSummaryCards'

type LedgerDirection = 'receivable' | 'payable'

/**
 * 往来账款 Tab（财务账款层）：
 * - 应收 / 应付方向切换独立于筛选条（视图选择 ≠ 列表筛选）；
 * - 出团日期主筛 + 次要条件默认折叠（antd advanced-search）；
 * - 每方向复用 PaymentScheduleWorkspace；游客代收节点不在本 Tab。
 */
export function PartnerLedgerPanel({ partnerId }: { partnerId: string }) {
  const [direction, setDirection] = useState<LedgerDirection>('receivable')
  const [departureDateRange, setDepartureDateRange] = useState<DepartureDateRange>(null)

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Segmented<LedgerDirection>
        value={direction}
        options={[
          { label: '应收', value: 'receivable' },
          { label: '应付', value: 'payable' },
        ]}
        onChange={setDirection}
      />

      <PaymentScheduleWorkspace
        key={direction}
        scope="partner"
        direction={direction}
        partnerId={partnerId}
        departureDateRange={departureDateRange}
        onDepartureDateRangeChange={setDepartureDateRange}
        hideDepartureDateFilter
        collapsibleSecondaryFilters
        filterToolbarPrimary={
          <DatePicker.RangePicker
            allowClear
            allowEmpty={[true, true]}
            placeholder={['出团日期起', '出团日期止']}
            presets={buildDepartureDateRangePresets()}
            value={
              departureDateRange
                ? [
                    departureDateRange[0] ? dayjs(departureDateRange[0]) : null,
                    departureDateRange[1] ? dayjs(departureDateRange[1]) : null,
                  ]
                : null
            }
            onChange={(values) =>
              setDepartureDateRange(
                values
                  ? [values[0]?.format('YYYY-MM-DD'), values[1]?.format('YYYY-MM-DD')]
                  : null,
              )
            }
          />
        }
        renderSummary={({ departureDateFrom, departureDateTo }) => (
          <PartnerLedgerSummaryCards
            partnerId={partnerId}
            direction={direction}
            departureDateFrom={departureDateFrom}
            departureDateTo={departureDateTo}
          />
        )}
      />
    </Space>
  )
}
