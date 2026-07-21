import { useCallback, useState } from 'react'
import { Form } from 'antd'
import type { FinanceTransactionSummary } from '@xiaotuanbao/shared'
import type { VoidTransactionFormValues } from '../components/VoidTransactionModal'
import {
  createEmptyTransactionFormValues,
  transactionToFormValues,
  type TransactionFormValues,
} from '../utils/transaction-form'
import type { CreateVerificationFormValues } from '../utils/verification-form'

export function useTransactionWorkspaceDialogs(lockedDepartureId?: string) {
  const [form] = Form.useForm<TransactionFormValues>()
  const [voidForm] = Form.useForm<VoidTransactionFormValues>()
  const [verifyForm] = Form.useForm<CreateVerificationFormValues>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create')
  const [editingTransaction, setEditingTransaction] = useState<FinanceTransactionSummary | null>(
    null,
  )
  const [voidModalOpen, setVoidModalOpen] = useState(false)
  const [voidingTransaction, setVoidingTransaction] = useState<FinanceTransactionSummary | null>(
    null,
  )
  const [detailTransactionId, setDetailTransactionId] = useState<string | null>(null)
  const [verifyTransaction, setVerifyTransaction] = useState<FinanceTransactionSummary | null>(null)

  const openDetail = useCallback((id: string) => {
    setDetailTransactionId(() => id)
  }, [])

  const closeDetail = useCallback(() => {
    setDetailTransactionId(null)
  }, [])

  const openVerify = useCallback((transaction: FinanceTransactionSummary) => {
    setVerifyTransaction(() => transaction)
  }, [])

  const closeVerify = useCallback(() => {
    setVerifyTransaction(null)
    verifyForm.resetFields()
  }, [verifyForm])

  const openVoidModal = useCallback((transaction: FinanceTransactionSummary) => {
    setVoidingTransaction(() => transaction)
    setVoidModalOpen(true)
  }, [])

  const closeVoidModal = useCallback(() => {
    setVoidModalOpen(false)
    setVoidingTransaction(null)
    voidForm.resetFields()
  }, [voidForm])

  const openEdit = useCallback(
    (transaction: FinanceTransactionSummary) => {
      setDrawerMode('edit')
      setEditingTransaction(() => transaction)
      form.resetFields()
      form.setFieldsValue(transactionToFormValues(transaction))
      setDrawerOpen(true)
    },
    [form],
  )

  const openCreate = useCallback(() => {
    setDrawerMode('create')
    setEditingTransaction(null)
    form.resetFields()
    form.setFieldsValue(
      lockedDepartureId
        ? { ...createEmptyTransactionFormValues(), departureId: lockedDepartureId }
        : createEmptyTransactionFormValues(),
    )
    setDrawerOpen(true)
  }, [form, lockedDepartureId])

  const closeTransactionDrawer = useCallback(() => {
    setDrawerOpen(false)
    setEditingTransaction(null)
    form.resetFields()
  }, [form])

  return {
    form,
    voidForm,
    verifyForm,
    drawerOpen,
    drawerMode,
    editingTransaction,
    voidModalOpen,
    voidingTransaction,
    detailTransactionId,
    verifyTransaction,
    openDetail,
    closeDetail,
    openVerify,
    closeVerify,
    openVoidModal,
    closeVoidModal,
    openEdit,
    openCreate,
    closeTransactionDrawer,
  }
}
