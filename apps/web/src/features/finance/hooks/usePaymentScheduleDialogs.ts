import { useCallback, useState } from 'react'
import { Form } from 'antd'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import type { AdjustAmountFormValues } from '../components/AdjustAmountModal'
import type { CancelScheduleFormValues } from '../components/CancelScheduleModal'
import type { ReopenScheduleFormValues } from '../components/ReopenScheduleModal'
import {
  scheduleToConfirmCollectionValues,
  type ConfirmCollectionFormValues,
} from '../utils/confirm-collection-form'
import {
  scheduleToConfirmPaymentValues,
  type ConfirmPaymentFormValues,
} from '../utils/confirm-payment-form'
import {
  scheduleToEditValues,
  type EditScheduleFormValues,
} from '../utils/edit-schedule-form'
import { centsToYuan } from '../utils/finance-form'
import type { CreateVerificationFormValues } from '../utils/verification-form'

export function usePaymentScheduleDialogs(isReceivable: boolean) {
  const [confirmForm] = Form.useForm<ConfirmCollectionFormValues | ConfirmPaymentFormValues>()
  const [verifyForm] = Form.useForm<CreateVerificationFormValues>()
  const [cancelForm] = Form.useForm<CancelScheduleFormValues>()
  const [reopenForm] = Form.useForm<ReopenScheduleFormValues>()
  const [adjustForm] = Form.useForm<AdjustAmountFormValues>()
  const [editForm] = Form.useForm<EditScheduleFormValues>()

  const [activeSchedule, setActiveSchedule] = useState<PaymentScheduleSummary | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailScheduleId, setDetailScheduleId] = useState<string | null>(null)

  const closeConfirm = useCallback(() => {
    confirmForm.resetFields()
    setConfirmOpen(false)
    setActiveSchedule(null)
  }, [confirmForm])

  const closeVerify = useCallback(() => {
    verifyForm.resetFields()
    setVerifyOpen(false)
    setActiveSchedule(null)
  }, [verifyForm])

  const closeCancel = useCallback(() => {
    cancelForm.resetFields()
    setCancelOpen(false)
    setActiveSchedule(null)
  }, [cancelForm])

  const closeReopen = useCallback(() => {
    reopenForm.resetFields()
    setReopenOpen(false)
    setActiveSchedule(null)
  }, [reopenForm])

  const closeAdjust = useCallback(() => {
    adjustForm.resetFields()
    setAdjustOpen(false)
    setActiveSchedule(null)
  }, [adjustForm])

  const closeEdit = useCallback(() => {
    editForm.resetFields()
    setEditOpen(false)
    setActiveSchedule(null)
  }, [editForm])

  const openConfirm = useCallback(
    (schedule: PaymentScheduleSummary) => {
      setActiveSchedule(() => schedule)
      confirmForm.resetFields()
      if (isReceivable) {
        confirmForm.setFieldsValue(scheduleToConfirmCollectionValues(schedule))
      } else {
        confirmForm.setFieldsValue(scheduleToConfirmPaymentValues(schedule))
      }
      setConfirmOpen(true)
    },
    [confirmForm, isReceivable],
  )

  const openVerify = useCallback((schedule: PaymentScheduleSummary) => {
    setActiveSchedule(() => schedule)
    setVerifyOpen(true)
  }, [])

  const openCancel = useCallback(
    (schedule: PaymentScheduleSummary) => {
      setActiveSchedule(() => schedule)
      cancelForm.resetFields()
      setCancelOpen(true)
    },
    [cancelForm],
  )

  const openReopen = useCallback(
    (schedule: PaymentScheduleSummary) => {
      setActiveSchedule(() => schedule)
      reopenForm.resetFields()
      setReopenOpen(true)
    },
    [reopenForm],
  )

  const openAdjust = useCallback(
    (schedule: PaymentScheduleSummary) => {
      setActiveSchedule(() => schedule)
      adjustForm.resetFields()
      adjustForm.setFieldsValue({
        amountYuan: centsToYuan(schedule.amountCents),
      })
      setAdjustOpen(true)
    },
    [adjustForm],
  )

  const openEdit = useCallback(
    (schedule: PaymentScheduleSummary) => {
      setActiveSchedule(() => schedule)
      editForm.resetFields()
      editForm.setFieldsValue(scheduleToEditValues(schedule))
      setEditOpen(true)
    },
    [editForm],
  )

  const openDetail = useCallback((schedule: PaymentScheduleSummary) => {
    setDetailScheduleId(schedule.id)
    setDetailOpen(true)
  }, [])

  const closeDetail = useCallback(() => {
    setDetailOpen(false)
    setDetailScheduleId(null)
  }, [])

  return {
    confirmForm,
    verifyForm,
    cancelForm,
    reopenForm,
    adjustForm,
    editForm,
    activeSchedule,
    confirmOpen,
    verifyOpen,
    cancelOpen,
    reopenOpen,
    adjustOpen,
    editOpen,
    detailOpen,
    detailScheduleId,
    closeConfirm,
    closeVerify,
    closeCancel,
    closeReopen,
    closeAdjust,
    closeEdit,
    closeDetail,
    openConfirm,
    openVerify,
    openCancel,
    openReopen,
    openAdjust,
    openEdit,
    openDetail,
  }
}
