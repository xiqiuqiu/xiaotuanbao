import { useCallback, useState } from 'react'
import { App } from 'antd'
import type { FormInstance } from 'antd/es/form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { FinanceVerificationListItem } from '@xiaotuanbao/shared'
import { cancelVerification, createVerification } from '@/services/finance.service'
import type { CancelVerificationFormValues } from '../components/CancelVerificationModal'
import {
  buildCreateVerificationPayload,
  type CreateVerificationFormValues,
} from '../utils/verification-form'

type UseVerificationWorkspaceMutationsOptions = {
  form: FormInstance<CreateVerificationFormValues>
  cancelForm: FormInstance<CancelVerificationFormValues>
  onCreateSuccess: () => void
  onCancelSuccess: () => void
}

export function useVerificationWorkspaceMutations({
  form,
  cancelForm,
  onCreateSuccess,
  onCancelSuccess,
}: UseVerificationWorkspaceMutationsOptions) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [cancellingVerification, setCancellingVerification] =
    useState<FinanceVerificationListItem | null>(null)

  const invalidateVerificationQueries = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['finance-verifications'] })
    void queryClient.invalidateQueries({ queryKey: ['departure-verifications'] })
    void queryClient.invalidateQueries({ queryKey: ['finance-receivables'] })
    void queryClient.invalidateQueries({ queryKey: ['finance-payables'] })
    void queryClient.invalidateQueries({ queryKey: ['departure-receivables'] })
    void queryClient.invalidateQueries({ queryKey: ['departure-payables'] })
    void queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
  }, [queryClient])

  const createMutation = useMutation({
    mutationFn: (values: CreateVerificationFormValues) =>
      createVerification(buildCreateVerificationPayload(values)),
    onSuccess: () => {
      message.success('核销已创建')
      form.resetFields()
      onCreateSuccess()
      invalidateVerificationQueries()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '创建失败')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: ({ id, cancelReason }: { id: string; cancelReason: string }) =>
      cancelVerification(id, { cancelReason }),
    onSuccess: () => {
      message.success('核销已撤销')
      setCancellingVerification(null)
      cancelForm.resetFields()
      onCancelSuccess()
      invalidateVerificationQueries()
      void queryClient.invalidateQueries({ queryKey: ['finance-verification'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '撤销失败')
    },
  })

  const openCancelModal = useCallback((verification: FinanceVerificationListItem) => {
    setCancellingVerification(() => verification)
  }, [])

  const closeCancelModal = useCallback(() => {
    setCancellingVerification(null)
    cancelForm.resetFields()
  }, [cancelForm])

  return {
    createMutation,
    cancelMutation,
    cancellingVerification,
    openCancelModal,
    closeCancelModal,
  }
}
