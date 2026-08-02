import { useCallback, useState } from 'react'
import { App } from 'antd'
import type { FormInstance } from 'antd/es/form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { FinanceVerificationListItem, PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { cancelVerification, createVerification } from '@/services/finance.service'
import type { CancelVerificationFormValues } from '../components/CancelVerificationModal'
import {
  buildGeneratedRebatePayableProcessNavigation,
  promptGeneratedRebatePayableFollowUp,
} from '../utils/prompt-generated-rebate-payable'
import {
  buildCreateVerificationPayload,
  type CreateVerificationFormValues,
  type CreateVerificationSubmission,
} from '../utils/verification-form'
import { invalidateFinanceMutationQueries } from '../utils/invalidate-finance-mutation-queries'

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
  const navigate = useNavigate()
  const [cancellingVerification, setCancellingVerification] =
    useState<FinanceVerificationListItem | null>(null)

  const goProcessRebatePayable = useCallback(
    (rebate: PaymentScheduleSummary) => {
      void navigate(buildGeneratedRebatePayableProcessNavigation(rebate))
    },
    [navigate],
  )

  const invalidateVerificationQueries = useCallback((departureIds?: readonly string[]) => {
    invalidateFinanceMutationQueries(queryClient, {
      queryKeys: [
        'finance-verifications',
        'finance-verification',
        'finance-receivables',
        'finance-payables',
        'finance-transactions',
      ],
      departureIds,
    })
  }, [queryClient])

  const createMutation = useMutation({
    mutationFn: (values: CreateVerificationSubmission) =>
      createVerification(buildCreateVerificationPayload(values)),
    onSuccess: (data, values) => {
      message.success('核销已创建')
      form.resetFields()
      onCreateSuccess()
      invalidateVerificationQueries(values.affectedDepartureIds)
      promptGeneratedRebatePayableFollowUp(data.generatedRebatePayable, goProcessRebatePayable)
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
