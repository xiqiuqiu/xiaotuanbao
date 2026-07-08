import type { FormInstance } from 'antd/es/form'
import type { UseMutationResult } from '@tanstack/react-query'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { ConfirmCollectionDrawer } from './ConfirmCollectionDrawer'
import { ConfirmPaymentDrawer } from './ConfirmPaymentDrawer'
import { CreateVerificationDrawer } from './CreateVerificationDrawer'
import { CancelScheduleModal, type CancelScheduleFormValues } from './CancelScheduleModal'
import { EditScheduleDrawer } from './EditScheduleDrawer'
import type { ConfirmCollectionFormValues } from '../utils/confirm-collection-form'
import type { ConfirmPaymentFormValues } from '../utils/confirm-payment-form'
import type { EditScheduleFormValues } from '../utils/edit-schedule-form'
import type { CreateVerificationFormValues } from '../utils/verification-form'

interface PaymentScheduleActionDialogsProps {
  isReceivable: boolean
  activeSchedule: PaymentScheduleSummary | null
  departureMap: Map<string, { departureNo: string; name: string }>
  lockedDepartureId?: string
  confirmOpen: boolean
  verifyOpen: boolean
  cancelOpen: boolean
  editOpen: boolean
  confirmForm: FormInstance<ConfirmCollectionFormValues | ConfirmPaymentFormValues>
  verifyForm: FormInstance<CreateVerificationFormValues>
  cancelForm: FormInstance<CancelScheduleFormValues>
  editForm: FormInstance<EditScheduleFormValues>
  confirmMutation: UseMutationResult<
    unknown,
    Error,
    ConfirmCollectionFormValues | ConfirmPaymentFormValues,
    unknown
  >
  verifyCreateMutation: UseMutationResult<unknown, Error, CreateVerificationFormValues, unknown>
  cancelMutation: UseMutationResult<unknown, Error, CancelScheduleFormValues, unknown>
  editMutation: UseMutationResult<unknown, Error, EditScheduleFormValues, unknown>
  onCloseConfirm: () => void
  onCloseVerify: () => void
  onCloseCancel: () => void
  onCloseEdit: () => void
}

export function PaymentScheduleActionDialogs({
  isReceivable,
  activeSchedule,
  departureMap,
  lockedDepartureId,
  confirmOpen,
  verifyOpen,
  cancelOpen,
  editOpen,
  confirmForm,
  verifyForm,
  cancelForm,
  editForm,
  confirmMutation,
  verifyCreateMutation,
  cancelMutation,
  editMutation,
  onCloseConfirm,
  onCloseVerify,
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

      <CreateVerificationDrawer
        open={verifyOpen}
        initialSchedule={activeSchedule ?? undefined}
        lockedDepartureId={lockedDepartureId ?? activeSchedule?.departureId}
        loading={verifyCreateMutation.isPending}
        form={verifyForm}
        onClose={onCloseVerify}
        onSubmit={(values) => verifyCreateMutation.mutate(values)}
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
