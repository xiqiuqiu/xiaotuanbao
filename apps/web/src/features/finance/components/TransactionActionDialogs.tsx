import type { FormInstance } from 'antd/es/form'
import type { FinanceTransactionSummary } from '@xiaotuanbao/shared'
import { CreateVerificationDrawer } from './CreateVerificationDrawer'
import { TransactionDetailDrawer } from './TransactionDetailDrawer'
import { TransactionFormDrawer } from './TransactionFormDrawer'
import {
  VoidTransactionModal,
  type VoidTransactionFormValues,
} from './VoidTransactionModal'
import type { TransactionFormValues } from '../utils/transaction-form'
import type { CreateVerificationFormValues } from '../utils/verification-form'

export type TransactionActionDialogsProps = {
  voidModalOpen: boolean
  voidingTransaction: FinanceTransactionSummary | null
  voidLoading: boolean
  voidForm: FormInstance<VoidTransactionFormValues>
  onCloseVoid: () => void
  onSubmitVoid: (values: VoidTransactionFormValues) => void
  drawerOpen: boolean
  drawerMode: 'create' | 'edit'
  editingTransaction: FinanceTransactionSummary | null
  transactionLoading: boolean
  transactionForm: FormInstance<TransactionFormValues>
  lockedDepartureId?: string
  onCloseTransaction: () => void
  onSubmitTransaction: (values: TransactionFormValues) => void
  detailTransactionId: string | null
  onCloseDetail: () => void
  verifyTransaction: FinanceTransactionSummary | null
  verifyLoading: boolean
  verifyForm: FormInstance<CreateVerificationFormValues>
  onCloseVerify: () => void
  onSubmitVerify: (values: CreateVerificationFormValues) => void
}

export function TransactionActionDialogs({
  voidModalOpen,
  voidingTransaction,
  voidLoading,
  voidForm,
  onCloseVoid,
  onSubmitVoid,
  drawerOpen,
  drawerMode,
  editingTransaction,
  transactionLoading,
  transactionForm,
  lockedDepartureId,
  onCloseTransaction,
  onSubmitTransaction,
  detailTransactionId,
  onCloseDetail,
  verifyTransaction,
  verifyLoading,
  verifyForm,
  onCloseVerify,
  onSubmitVerify,
}: TransactionActionDialogsProps) {
  return (
    <>
      <VoidTransactionModal
        open={voidModalOpen}
        transaction={voidingTransaction}
        loading={voidLoading}
        form={voidForm}
        onClose={onCloseVoid}
        onSubmit={onSubmitVoid}
      />

      <TransactionFormDrawer
        open={drawerOpen}
        mode={drawerMode}
        editingTransaction={editingTransaction}
        loading={transactionLoading}
        form={transactionForm}
        lockedDepartureId={lockedDepartureId}
        onClose={onCloseTransaction}
        onSubmit={onSubmitTransaction}
      />

      <TransactionDetailDrawer
        open={Boolean(detailTransactionId)}
        transactionId={detailTransactionId}
        onClose={onCloseDetail}
      />

      {verifyTransaction ? (
        <CreateVerificationDrawer
          key={verifyTransaction.id}
          open={Boolean(verifyTransaction)}
          initialTransaction={verifyTransaction}
          lockedDepartureId={lockedDepartureId}
          loading={verifyLoading}
          form={verifyForm}
          onClose={onCloseVerify}
          onSubmit={onSubmitVerify}
        />
      ) : null}
    </>
  )
}
