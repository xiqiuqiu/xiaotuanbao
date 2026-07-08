import type { FormInstance } from 'antd/es/form'
import type { UseMutationResult } from '@tanstack/react-query'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { ConfirmCollectionDrawer } from './ConfirmCollectionDrawer'
import { ConfirmPaymentDrawer } from './ConfirmPaymentDrawer'
import { LinkTransactionModal } from './LinkTransactionModal'
import { CancelScheduleModal, type CancelScheduleFormValues } from './CancelScheduleModal'
import { EditScheduleDrawer } from './EditScheduleDrawer'
import type { ConfirmCollectionFormValues } from '../utils/confirm-collection-form'
import type { ConfirmPaymentFormValues } from '../utils/confirm-payment-form'
import type { LinkTransactionFormValues } from '../utils/link-transaction-form'
import type { EditScheduleFormValues } from '../utils/edit-schedule-form'

interface PaymentScheduleActionDialogsProps {
  isReceivable: boolean
  activeSchedule: PaymentScheduleSummary | null
  departureMap: Map<string, { departureNo: string; name: string }>
  confirmOpen: boolean
  linkOpen: boolean
  cancelOpen: boolean
  editOpen: boolean
  confirmForm: FormInstance<ConfirmCollectionFormValues | ConfirmPaymentFormValues>
  linkForm: FormInstance<LinkTransactionFormValues>
  cancelForm: FormInstance<CancelScheduleFormValues>
  editForm: FormInstance<EditScheduleFormValues>
  confirmMutation: UseMutationResult<
    unknown,
    Error,
    ConfirmCollectionFormValues | ConfirmPaymentFormValues,
    unknown
  >
  linkMutation: UseMutationResult<unknown, Error, LinkTransactionFormValues, unknown>
  cancelMutation: UseMutationResult<unknown, Error, CancelScheduleFormValues, unknown>
  editMutation: UseMutationResult<unknown, Error, EditScheduleFormValues, unknown>
  onCloseConfirm: () => void
  onCloseLink: () => void
  onCloseCancel: () => void
  onCloseEdit: () => void
}

export function PaymentScheduleActionDialogs({
  isReceivable,
  activeSchedule,
  departureMap,
  confirmOpen,
  linkOpen,
  cancelOpen,
  editOpen,
  confirmForm,
  linkForm,
  cancelForm,
  editForm,
  confirmMutation,
  linkMutation,
  cancelMutation,
  editMutation,
  onCloseConfirm,
  onCloseLink,
  onCloseCancel,
  onCloseEdit,
}: PaymentScheduleActionDialogsProps) {
  return (
    <>
      {isReceivable ? (
        <ConfirmCollectionDrawer
          open={confirmOpen}
          schedule={activeSchedule}
          departureMap={departureMap}
          loading={confirmMutation.isPending}
          form={confirmForm}
          onClose={onCloseConfirm}
          onSubmit={(values) => confirmMutation.mutate(values)}
        />
      ) : (
        <ConfirmPaymentDrawer
          open={confirmOpen}
          schedule={activeSchedule}
          departureMap={departureMap}
          loading={confirmMutation.isPending}
          form={confirmForm}
          onClose={onCloseConfirm}
          onSubmit={(values) => confirmMutation.mutate(values)}
        />
      )}

      <LinkTransactionModal
        open={linkOpen}
        schedule={activeSchedule}
        loading={linkMutation.isPending}
        form={linkForm}
        onClose={onCloseLink}
        onSubmit={(values) => linkMutation.mutate(values)}
      />

      <CancelScheduleModal
        open={cancelOpen}
        schedule={activeSchedule}
        loading={cancelMutation.isPending}
        form={cancelForm}
        onClose={onCloseCancel}
        onSubmit={(values) => cancelMutation.mutate(values)}
      />

      <EditScheduleDrawer
        open={editOpen}
        schedule={activeSchedule}
        loading={editMutation.isPending}
        form={editForm}
        onClose={onCloseEdit}
        onSubmit={(values) => editMutation.mutate(values)}
      />
    </>
  )
}
