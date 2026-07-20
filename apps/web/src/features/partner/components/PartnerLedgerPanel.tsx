import { useState } from 'react'
import dayjs from 'dayjs'
import { DatePicker, Segmented, Space } from 'antd'
import { useAuthStore } from '@/app/store/auth.store'
import { PaymentScheduleWorkspace } from '@/features/finance/components/PaymentScheduleWorkspace'
import type { DepartureDateRange } from '@/features/finance/components/PaymentScheduleFilters'
import { canMutateFinance } from '@/features/finance/utils/finance-permission'
import { buildDepartureDateRangePresets } from '@/utils/dateRangePresets'
import { PartnerLedgerSummaryCards } from './PartnerLedgerSummaryCards'

type LedgerDirection = 'receivable' | 'payable'

/**
 * 往来账款 Tab（财务账款层）：
 * - 应收 / 应付方向切换独立于筛选条（视图选择 ≠ 列表筛选）；
 * - 出团日期主筛 + 次要条件默认折叠（antd advanced-search）；
 * - 每方向复用 PaymentScheduleWorkspace；游客代收节点不在本 Tab；
 * - 财务操作按 canMutateFinance gating：非财务角色只读（看得到账款、看不到操作按钮）。
 */
export function PartnerLedgerPanel({ partnerId }: { partnerId: string }) {
  const [direction, setDirection] = useState<LedgerDirection>('receivable')
  const [departureDateRange, setDepartureDateRange] = useState<DepartureDateRange>(null)
  const menuKeys = useAuthStore((state) => state.menuKeys)
  const readOnly = !canMutateFinance(menuKeys)

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
        readOnly={readOnly}
        departureDateRange={departureDateRange}
        onDepartureDateRangeChange={setDepartureDateRange}
        hideDepartureDateFilter
        collapsibleSecondaryFilters
        filterToolbarPrimary={({ onDepartureDateRangeChange }) => (
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
              onDepartureDateRangeChange(
                values
                  ? [values[0]?.format('YYYY-MM-DD'), values[1]?.format('YYYY-MM-DD')]
                  : null,
              )
            }
          />
        )}
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
