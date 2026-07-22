import { useState } from 'react'
import { useAuthStore } from '@/app/store/auth.store'
import { PaymentScheduleWorkspace } from '@/features/finance/components/PaymentScheduleWorkspace'
import type { DepartureDateRange } from '@/features/finance/components/PaymentScheduleFilters'
import { canMutateFinance } from '@/features/finance/utils/finance-permission'
import { SupplierLedgerSummaryCards } from './SupplierLedgerSummaryCards'

/**
 * 供应商往来账款 Tab（财务账款层）：
 * - 仅应付方向，无应收/应付切换（供应商结构上只有应付）；
 * - 出团日期与次要条件一并平铺（与全局应付筛选条同构）；
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
