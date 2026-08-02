import type { FormInstance } from 'antd/es/form'
import type { UseMutationResult } from '@tanstack/react-query'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { ConfirmCollectionDrawer } from './ConfirmCollectionDrawer'
import { ConfirmPaymentDrawer } from './ConfirmPaymentDrawer'
import { CreateVerificationDrawer } from './CreateVerificationDrawer'
import { AdjustAmountModal, type AdjustAmountFormValues } from './AdjustAmountModal'
import { CancelScheduleModal, type CancelScheduleFormValues } from './CancelScheduleModal'
import { ReopenScheduleModal, type ReopenScheduleFormValues } from './ReopenScheduleModal'
import { EditScheduleDrawer } from './EditScheduleDrawer'
import type { ConfirmCollectionFormValues } from '../utils/confirm-collection-form'
import type { ConfirmPaymentFormValues } from '../utils/confirm-payment-form'
import type { EditScheduleFormValues } from '../utils/edit-schedule-form'
import type {
  CreateVerificationFormValues,
  CreateVerificationSubmission,
} from '../utils/verification-form'

interface PaymentScheduleActionDialogsProps {
  isReceivable: boolean
  activeSchedule: PaymentScheduleSummary | null
  departureMap: Map<string, { departureNo: string; name: string }>
  lockedDepartureId?: string
  confirmOpen: boolean
  verifyOpen: boolean
  cancelOpen: boolean
  reopenOpen: boolean
  adjustOpen: boolean
  editOpen: boolean
  confirmForm: FormInstance<ConfirmCollectionFormValues | ConfirmPaymentFormValues>
  verifyForm: FormInstance<CreateVerificationFormValues>
  cancelForm: FormInstance<CancelScheduleFormValues>
  reopenForm: FormInstance<ReopenScheduleFormValues>
  adjustForm: FormInstance<AdjustAmountFormValues>
  editForm: FormInstance<EditScheduleFormValues>
  confirmMutation: UseMutationResult<
    unknown,
    Error,
    ConfirmCollectionFormValues | ConfirmPaymentFormValues,
    unknown
  >
  verifyCreateMutation: UseMutationResult<unknown, Error, CreateVerificationSubmission, unknown>
  cancelMutation: UseMutationResult<unknown, Error, CancelScheduleFormValues, unknown>
  reopenMutation: UseMutationResult<unknown, Error, ReopenScheduleFormValues, unknown>
  adjustMutation: UseMutationResult<unknown, Error, AdjustAmountFormValues, unknown>
  editMutation: UseMutationResult<unknown, Error, EditScheduleFormValues, unknown>
  onCloseConfirm: () => void
  onCloseVerify: () => void
  onCloseCancel: () => void
  onCloseReopen: () => void
  onCloseAdjust: () => void
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
  reopenOpen,
  adjustOpen,
  editOpen,
  confirmForm,
  verifyForm,
  cancelForm,
  reopenForm,
  adjustForm,
  editForm,
  confirmMutation,
  verifyCreateMutation,
  cancelMutation,
  reopenMutation,
  adjustMutation,
  editMutation,
  onCloseConfirm,
  onCloseVerify,
  onCloseCancel,
  onCloseReopen,
  onCloseAdjust,
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

      {verifyOpen && activeSchedule ? (
        <CreateVerificationDrawer
          key={activeSchedule.id}
          open={verifyOpen}
          initialSchedule={activeSchedule}
          lockedDepartureId={lockedDepartureId}
          loading={verifyCreateMutation.isPending}
          form={verifyForm}
          onClose={onCloseVerify}
          onSubmit={(values) => verifyCreateMutation.mutate(values)}
        />
      ) : null}

      <CancelScheduleModal
        open={cancelOpen}
        schedule={activeSchedule}
        loading={cancelMutation.isPending}
        form={cancelForm}
        onClose={onCloseCancel}
        onSubmit={(values) => cancelMutation.mutate(values)}
      />

      <ReopenScheduleModal
        open={reopenOpen}
        schedule={activeSchedule}
        loading={reopenMutation.isPending}
        form={reopenForm}
        onClose={onCloseReopen}
        onSubmit={(values) => reopenMutation.mutate(values)}
      />

      <AdjustAmountModal
        open={adjustOpen}
        schedule={activeSchedule}
        loading={adjustMutation.isPending}
        form={adjustForm}
        onClose={onCloseAdjust}
        onSubmit={(values) => adjustMutation.mutate(values)}
      />

      <EditScheduleDrawer
        open={editOpen}
        schedule={activeSchedule}
        loading={editMutation.isPending}
        form={editForm}
        isReceivable={isReceivable}
        onClose={onCloseEdit}
        onSubmit={(values) => editMutation.mutate(values)}
      />
    </>
  )
}
