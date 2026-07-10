import { useMutation } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { message } from 'antd'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import {
  cancelSchedule,
  confirmCollection,
  confirmPayment,
  createVerification,
  reopenSchedule,
  updatePayable,
  updateReceivable,
} from '@/services/finance.service'
import type { FormInstance } from 'antd/es/form'
import type { CancelScheduleFormValues } from '../components/CancelScheduleModal'
import type { ReopenScheduleFormValues } from '../components/ReopenScheduleModal'
import {
  buildConfirmCollectionPayload,
  type ConfirmCollectionFormValues,
} from '../utils/confirm-collection-form'
import {
  buildConfirmPaymentPayload,
  type ConfirmPaymentFormValues,
} from '../utils/confirm-payment-form'
import {
  buildUpdateSchedulePayload,
  type EditScheduleFormValues,
} from '../utils/edit-schedule-form'
import {
  buildCreateVerificationPayload,
  type CreateVerificationFormValues,
} from '../utils/verification-form'

interface UsePaymentScheduleMutationsOptions {
  queryClient: QueryClient
  isReceivable: boolean
  listQueryKey: string
  departureListQueryKey: string
  activeSchedule: PaymentScheduleSummary | null
  confirmForm: FormInstance<ConfirmCollectionFormValues | ConfirmPaymentFormValues>
  verifyForm: FormInstance<CreateVerificationFormValues>
  cancelForm: FormInstance<CancelScheduleFormValues>
  reopenForm: FormInstance<ReopenScheduleFormValues>
  editForm: FormInstance<EditScheduleFormValues>
  onConfirmSuccess: () => void
  onVerifySuccess: () => void
  onCancelSuccess: () => void
  onReopenSuccess: () => void
  onEditSuccess: () => void
}

export function usePaymentScheduleMutations({
  queryClient,
  isReceivable,
  listQueryKey,
  departureListQueryKey,
  activeSchedule,
  confirmForm,
  verifyForm,
  cancelForm,
  reopenForm,
  editForm,
  onConfirmSuccess,
  onVerifySuccess,
  onCancelSuccess,
  onReopenSuccess,
  onEditSuccess,
}: UsePaymentScheduleMutationsOptions) {
  const confirmMutation = useMutation({
    mutationFn: async (values: ConfirmCollectionFormValues | ConfirmPaymentFormValues) => {
      if (!activeSchedule) {
        throw new Error('未选择节点')
      }
      if (isReceivable) {
        return confirmCollection(activeSchedule.id, buildConfirmCollectionPayload(values))
      }
      return confirmPayment(activeSchedule.id, buildConfirmPaymentPayload(values))
    },
    onSuccess: () => {
      message.success(isReceivable ? '收款已登记' : '付款已登记')
      confirmForm.resetFields()
      onConfirmSuccess()
      void queryClient.invalidateQueries({ queryKey: [listQueryKey] })
      void queryClient.invalidateQueries({ queryKey: [departureListQueryKey] })
      void queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-verifications'] })
      void queryClient.invalidateQueries({ queryKey: ['departure-verifications'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '操作失败')
    },
  })

  const verifyCreateMutation = useMutation({
    mutationFn: (values: CreateVerificationFormValues) =>
      createVerification(buildCreateVerificationPayload(values)),
    onSuccess: () => {
      message.success('核销已完成')
      verifyForm.resetFields()
      onVerifySuccess()
      void queryClient.invalidateQueries({ queryKey: [listQueryKey] })
      void queryClient.invalidateQueries({ queryKey: [departureListQueryKey] })
      void queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-verifications'] })
      void queryClient.invalidateQueries({ queryKey: ['departure-verifications'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '核销失败')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async (values: CancelScheduleFormValues) => {
      if (!activeSchedule) {
        throw new Error('未选择节点')
      }
      return cancelSchedule(activeSchedule.id, {
        closeDisposition: values.closeDisposition,
        cancelReason: values.cancelReason.trim(),
      })
    },
    onSuccess: () => {
      message.success('节点已关闭')
      cancelForm.resetFields()
      onCancelSuccess()
      void queryClient.invalidateQueries({ queryKey: [listQueryKey] })
      void queryClient.invalidateQueries({ queryKey: [departureListQueryKey] })
      void queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-verifications'] })
      void queryClient.invalidateQueries({ queryKey: ['departure-verifications'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '关闭失败')
    },
  })

  const reopenMutation = useMutation({
    mutationFn: async (values: ReopenScheduleFormValues) => {
      if (!activeSchedule) {
        throw new Error('未选择节点')
      }
      return reopenSchedule(activeSchedule.id, {
        reopenReason: values.reopenReason.trim(),
      })
    },
    onSuccess: () => {
      message.success('节点已重新打开')
      reopenForm.resetFields()
      onReopenSuccess()
      void queryClient.invalidateQueries({ queryKey: [listQueryKey] })
      void queryClient.invalidateQueries({ queryKey: [departureListQueryKey] })
      void queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-verifications'] })
      void queryClient.invalidateQueries({ queryKey: ['departure-verifications'] })
      void queryClient.invalidateQueries({ queryKey: ['payment-schedule-detail'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '重新打开失败')
    },
  })

  const editMutation = useMutation({
    mutationFn: async (values: EditScheduleFormValues) => {
      if (!activeSchedule) {
        throw new Error('未选择节点')
      }
      const payload = buildUpdateSchedulePayload(activeSchedule, values)
      return isReceivable
        ? updateReceivable(activeSchedule.id, payload)
        : updatePayable(activeSchedule.id, payload)
    },
    onSuccess: () => {
      message.success('节点已更新')
      editForm.resetFields()
      onEditSuccess()
      void queryClient.invalidateQueries({ queryKey: [listQueryKey] })
      void queryClient.invalidateQueries({ queryKey: [departureListQueryKey] })
      void queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-verifications'] })
      void queryClient.invalidateQueries({ queryKey: ['departure-verifications'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '更新失败')
    },
  })

  return {
    confirmMutation,
    verifyCreateMutation,
    cancelMutation,
    reopenMutation,
    editMutation,
  }
}
