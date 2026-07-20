import { useState } from 'react'
import dayjs from 'dayjs'
import { DatePicker } from 'antd'
import { useAuthStore } from '@/app/store/auth.store'
import { PaymentScheduleWorkspace } from '@/features/finance/components/PaymentScheduleWorkspace'
import type { DepartureDateRange } from '@/features/finance/components/PaymentScheduleFilters'
import { canMutateFinance } from '@/features/finance/utils/finance-permission'
import { buildDepartureDateRangePresets } from '@/utils/dateRangePresets'
import { SupplierLedgerSummaryCards } from './SupplierLedgerSummaryCards'

/**
 * 供应商往来账款 Tab（财务账款层）：
 * - 仅应付方向，无应收/应付切换（供应商结构上只有应付）；
 * - 出团日期主筛 + 次要条件默认折叠（antd advanced-search）；
 * - 复用 PaymentScheduleWorkspace（scope='supplier'）；
 * - 财务操作按 canMutateFinance gating：非财务角色只读（看得到账款、看不到操作按钮）。
 */
export function SupplierLedgerPanel({ supplierId }: { supplierId: string }) {
  const [departureDateRange, setDepartureDateRange] = useState<DepartureDateRange>(null)
  const menuKeys = useAuthStore((state) => state.menuKeys)
  const readOnly = !canMutateFinance(menuKeys)

  return (
    <PaymentScheduleWorkspace
      scope="supplier"
      direction="payable"
      supplierId={supplierId}
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
        <SupplierLedgerSummaryCards
          supplierId={supplierId}
          departureDateFrom={departureDateFrom}
          departureDateTo={departureDateTo}
        />
      )}
    />
  )
}
