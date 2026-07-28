import { useMutation } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { App } from 'antd'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import {
  adjustScheduleAmount,
  cancelSchedule,
  confirmCollection,
  confirmPayment,
  createVerification,
  reopenSchedule,
  updatePayable,
  updateReceivable,
} from '@/services/finance.service'
import type { FormInstance } from 'antd/es/form'
import type { AdjustAmountFormValues } from '../components/AdjustAmountModal'
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
import { yuanToCents } from '../utils/finance-form'
import {
  buildCreateVerificationPayload,
  type CreateVerificationFormValues,
} from '../utils/verification-form'
import {
  PARTNER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY,
  SUPPLIER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY,
} from '../queries/finance-query-keys'

interface UsePaymentScheduleMutationsOptions {
  queryClient: QueryClient
  isReceivable: boolean
  listQueryKey: string
  departureListQueryKey: string
  partnerListQueryKey: string
  supplierListQueryKey: string
  activeSchedule: PaymentScheduleSummary | null
  confirmForm: FormInstance<ConfirmCollectionFormValues | ConfirmPaymentFormValues>
  verifyForm: FormInstance<CreateVerificationFormValues>
  cancelForm: FormInstance<CancelScheduleFormValues>
  reopenForm: FormInstance<ReopenScheduleFormValues>
  adjustForm: FormInstance<AdjustAmountFormValues>
  editForm: FormInstance<EditScheduleFormValues>
  onConfirmSuccess: () => void
  onVerifySuccess: () => void
  onCancelSuccess: () => void
  onReopenSuccess: () => void
  onAdjustSuccess: () => void
  onEditSuccess: () => void
}

export function usePaymentScheduleMutations({
  queryClient,
  isReceivable,
  listQueryKey,
  departureListQueryKey,
  partnerListQueryKey,
  supplierListQueryKey,
  activeSchedule,
  confirmForm,
  verifyForm,
  cancelForm,
  reopenForm,
  adjustForm,
  editForm,
  onConfirmSuccess,
  onVerifySuccess,
  onCancelSuccess,
  onReopenSuccess,
  onAdjustSuccess,
  onEditSuccess,
}: UsePaymentScheduleMutationsOptions) {
  const { message } = App.useApp()
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
      void queryClient.invalidateQueries({ queryKey: [partnerListQueryKey] })
      void queryClient.invalidateQueries({ queryKey: [supplierListQueryKey] })
      void queryClient.invalidateQueries({ queryKey: [PARTNER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [SUPPLIER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY] })
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
      void queryClient.invalidateQueries({ queryKey: [partnerListQueryKey] })
      void queryClient.invalidateQueries({ queryKey: [supplierListQueryKey] })
      void queryClient.invalidateQueries({ queryKey: [PARTNER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [SUPPLIER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY] })
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
      void queryClient.invalidateQueries({ queryKey: [partnerListQueryKey] })
      void queryClient.invalidateQueries({ queryKey: [supplierListQueryKey] })
      void queryClient.invalidateQueries({ queryKey: [PARTNER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [SUPPLIER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY] })
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
        ...(values.confirmDepartureSettlementReversal === true
          ? { confirmDepartureSettlementReversal: true }
          : {}),
      })
    },
    onSuccess: () => {
      message.success('节点已重新打开')
      reopenForm.resetFields()
      onReopenSuccess()
      void queryClient.invalidateQueries({ queryKey: [listQueryKey] })
      void queryClient.invalidateQueries({ queryKey: [departureListQueryKey] })
      void queryClient.invalidateQueries({ queryKey: [partnerListQueryKey] })
      void queryClient.invalidateQueries({ queryKey: [supplierListQueryKey] })
      void queryClient.invalidateQueries({ queryKey: [PARTNER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [SUPPLIER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-verifications'] })
      void queryClient.invalidateQueries({ queryKey: ['departure-verifications'] })
      void queryClient.invalidateQueries({ queryKey: ['payment-schedule-detail'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '重新打开失败')
    },
  })

  const adjustMutation = useMutation({
    mutationFn: async (values: AdjustAmountFormValues) => {
      if (!activeSchedule) {
        throw new Error('未选择节点')
      }
      return adjustScheduleAmount(activeSchedule.id, {
        amountCents: yuanToCents(values.amountYuan),
        adjustReason: values.adjustReason.trim(),
      })
    },
    onSuccess: () => {
      message.success('约定金额已调整')
      adjustForm.resetFields()
      onAdjustSuccess()
      void queryClient.invalidateQueries({ queryKey: [listQueryKey] })
      void queryClient.invalidateQueries({ queryKey: [departureListQueryKey] })
      void queryClient.invalidateQueries({ queryKey: [partnerListQueryKey] })
      void queryClient.invalidateQueries({ queryKey: [supplierListQueryKey] })
      void queryClient.invalidateQueries({ queryKey: [PARTNER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [SUPPLIER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-verifications'] })
      void queryClient.invalidateQueries({ queryKey: ['departure-verifications'] })
      void queryClient.invalidateQueries({ queryKey: ['payment-schedule-detail'] })
      void queryClient.invalidateQueries({ queryKey: ['segment-resources'] })
      // Explicit adjust also syncs source-order path amounts (ADR-0010).
      void queryClient.invalidateQueries({ queryKey: ['source-orders'] })
      void queryClient.invalidateQueries({ queryKey: ['source-order'] })
      void queryClient.invalidateQueries({ queryKey: ['departure'] })
      void queryClient.invalidateQueries({ queryKey: ['departures'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '调整失败')
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
      void queryClient.invalidateQueries({ queryKey: [partnerListQueryKey] })
      void queryClient.invalidateQueries({ queryKey: [supplierListQueryKey] })
      void queryClient.invalidateQueries({ queryKey: [PARTNER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [SUPPLIER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-verifications'] })
      void queryClient.invalidateQueries({ queryKey: ['departure-verifications'] })
      // Ordinary amount edits sync source facts; keep execution / source-order tabs fresh.
      void queryClient.invalidateQueries({ queryKey: ['segment-resources'] })
      void queryClient.invalidateQueries({ queryKey: ['source-orders'] })
      void queryClient.invalidateQueries({ queryKey: ['source-order'] })
      void queryClient.invalidateQueries({ queryKey: ['departure'] })
      void queryClient.invalidateQueries({ queryKey: ['departures'] })
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
    adjustMutation,
    editMutation,
  }
}
