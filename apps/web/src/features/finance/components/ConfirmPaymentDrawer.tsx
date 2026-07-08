import type { FormInstance } from 'antd/es/form'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { RegisterSettlementDrawer } from './RegisterSettlementDrawer'
import type { RegisterSettlementFormValues } from '../utils/register-settlement-form'

interface ConfirmPaymentDrawerProps {
  open: boolean
  schedule: PaymentScheduleSummary | null
  departureMap: Map<string, { departureNo: string; name: string }>
  loading: boolean
  form: FormInstance<RegisterSettlementFormValues>
  onClose: () => void
  onSubmit: (values: RegisterSettlementFormValues) => void
}

export function ConfirmPaymentDrawer(props: ConfirmPaymentDrawerProps) {
  return <RegisterSettlementDrawer variant="payment" {...props} />
}
