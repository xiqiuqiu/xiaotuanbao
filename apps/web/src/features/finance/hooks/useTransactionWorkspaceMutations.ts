import { useCallback } from 'react'
import { message } from 'antd'
import type { FormInstance } from 'antd/es/form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { FinanceTransactionSummary } from '@xiaotuanbao/shared'
import {
  createTransaction,
  createVerification,
  updateTransaction,
  voidTransaction,
} from '@/services/finance.service'
import type { VoidTransactionFormValues } from '../components/VoidTransactionModal'
import {
  buildCreateTransactionPayload,
  buildUpdateTransactionPayload,
  type TransactionFormValues,
} from '../utils/transaction-form'
import {
  buildCreateVerificationPayload,
  type CreateVerificationFormValues,
} from '../utils/verification-form'

type UseTransactionWorkspaceMutationsOptions = {
  lockedDepartureId?: string
  editingTransaction: FinanceTransactionSummary | null
  form: FormInstance<TransactionFormValues>
  voidForm: FormInstance<VoidTransactionFormValues>
  verifyForm: FormInstance<CreateVerificationFormValues>
  onCreateOrUpdateSuccess: () => void
  onVoidSuccess: () => void
  onVerifySuccess: () => void
}

export function useTransactionWorkspaceMutations({
  lockedDepartureId,
  editingTransaction,
  form,
  voidForm,
  verifyForm,
  onCreateOrUpdateSuccess,
  onVoidSuccess,
  onVerifySuccess,
}: UseTransactionWorkspaceMutationsOptions) {
  const queryClient = useQueryClient()

  const invalidateLists = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
    void queryClient.invalidateQueries({ queryKey: ['departure-transactions'] })
    void queryClient.invalidateQueries({ queryKey: ['finance-receivables'] })
    void queryClient.invalidateQueries({ queryKey: ['finance-payables'] })
    void queryClient.invalidateQueries({ queryKey: ['departure-receivables'] })
    void queryClient.invalidateQueries({ queryKey: ['departure-payables'] })
    void queryClient.invalidateQueries({ queryKey: ['finance-verifications'] })
    void queryClient.invalidateQueries({ queryKey: ['departure-verifications'] })
    if (lockedDepartureId) {
      void queryClient.invalidateQueries({ queryKey: ['departure', lockedDepartureId] })
    }
  }, [lockedDepartureId, queryClient])

  const createMutation = useMutation({
    mutationFn: (values: TransactionFormValues) =>
      createTransaction(buildCreateTransactionPayload(values)),
    onSuccess: () => {
      message.success('流水已创建')
      form.resetFields()
      onCreateOrUpdateSuccess()
      invalidateLists()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '创建失败')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (values: TransactionFormValues) => {
      if (!editingTransaction) {
        throw new Error('未选择流水')
      }
      return updateTransaction(editingTransaction.id, buildUpdateTransactionPayload(values))
    },
    onSuccess: () => {
      message.success('流水已更新')
      form.resetFields()
      onCreateOrUpdateSuccess()
      invalidateLists()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '更新失败')
    },
  })

  const voidMutation = useMutation({
    mutationFn: ({ id, voidReason }: { id: string; voidReason: string }) =>
      voidTransaction(id, { voidReason }),
    onSuccess: () => {
      message.success('流水已作废')
      voidForm.resetFields()
      onVoidSuccess()
      invalidateLists()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '作废失败')
    },
  })

  const verifyMutation = useMutation({
    mutationFn: (values: CreateVerificationFormValues) =>
      createVerification(buildCreateVerificationPayload(values)),
    onSuccess: () => {
      message.success('核销已创建')
      verifyForm.resetFields()
      onVerifySuccess()
      invalidateLists()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '核销失败')
    },
  })

  return {
    createMutation,
    updateMutation,
    voidMutation,
    verifyMutation,
  }
}
