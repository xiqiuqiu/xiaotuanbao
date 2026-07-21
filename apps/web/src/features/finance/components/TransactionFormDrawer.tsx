import { useEffect, useRef } from 'react'
import { Drawer, Form, Space, Button, Typography } from 'antd'
import type { FormInstance } from 'antd/es/form'
import {
  CounterpartyType,
  TransactionDirection,
  type FinanceTransactionSummary,
} from '@xiaotuanbao/shared'
import { formatCents } from '../catalog'
import { centsToYuan } from '../utils/finance-form'
import {
  formatGuestCollectionSuggestionText,
  shouldReplaceSuggestedAmount,
} from '../utils/transaction-amount-suggestion'
import { type TransactionFormValues } from '../utils/transaction-form'
import { useTransactionFormDrawerQueries } from '../hooks/useTransactionFormDrawerQueries'
import { TransactionFormDrawerFields } from './TransactionFormDrawerFields'

interface TransactionFormDrawerProps {
  open: boolean
  mode: 'create' | 'edit'
  editingTransaction: FinanceTransactionSummary | null
  loading: boolean
  form: FormInstance<TransactionFormValues>
  /** When set, association is locked to this departure (create + edit). */
  lockedDepartureId?: string
  onClose: () => void
  onSubmit: (values: TransactionFormValues) => void
}

export function TransactionFormDrawer({
  open,
  mode,
  editingTransaction,
  loading,
  form,
  lockedDepartureId,
  onClose,
  onSubmit,
}: TransactionFormDrawerProps) {
  const counterpartyType = Form.useWatch('counterpartyType', form)
  const departureId = Form.useWatch('departureId', form)
  const direction = Form.useWatch('direction', form)
  const counterpartyId = Form.useWatch('counterpartyId', form)
  const departureLocked = Boolean(lockedDepartureId)
  const lastSuggestedYuanRef = useRef<number | undefined>(undefined)
  const lastSuggestedSourceOrderIdRef = useRef<string | undefined>(undefined)

  const {
    amountSuggestion,
    departureOptions,
    guestSuggestionEnabled,
    partnerOptions,
    partnersResult,
    sourceOrderOptions,
    sourceOrdersResult,
    supplierOptions,
    suppliersResult,
  } = useTransactionFormDrawerQueries({
    open,
    mode,
    editingTransaction,
    counterpartyType,
    departureId,
    direction,
    counterpartyId,
  })

  useEffect(() => {
    if (!amountSuggestion || !counterpartyId) {
      return
    }
    if (lastSuggestedSourceOrderIdRef.current === counterpartyId) {
      return
    }
    const previousSourceOrderId = lastSuggestedSourceOrderIdRef.current
    lastSuggestedSourceOrderIdRef.current = counterpartyId

    if (!previousSourceOrderId) {
      return
    }

    // 已结清 / 已覆盖 / 建议额非正：只更新对照，不覆盖金额（避免写入 0）。
    if (
      amountSuggestion.settledHint === 'settled' ||
      amountSuggestion.settledHint === 'covered' ||
      amountSuggestion.suggestedAmountCents <= 0
    ) {
      lastSuggestedYuanRef.current = undefined
      return
    }

    const currentYuan = form.getFieldValue('amountYuan') as number | undefined
    if (
      shouldReplaceSuggestedAmount({
        currentYuan,
        previousSuggestedYuan: lastSuggestedYuanRef.current,
      })
    ) {
      const nextYuan = centsToYuan(amountSuggestion.suggestedAmountCents)
      form.setFieldsValue({ amountYuan: nextYuan })
      lastSuggestedYuanRef.current = nextYuan
    }
  }, [amountSuggestion, counterpartyId, form])

  const handleClose = () => {
    form.resetFields()
    lastSuggestedYuanRef.current = undefined
    lastSuggestedSourceOrderIdRef.current = undefined
    onClose()
  }

  const clearCounterparty = () => {
    form.setFieldsValue({
      counterpartyId: undefined,
      counterpartyName: undefined,
    })
    lastSuggestedYuanRef.current = undefined
    lastSuggestedSourceOrderIdRef.current = undefined
  }

  const applySuggestedAmount = () => {
    if (
      !amountSuggestion ||
      amountSuggestion.settledHint === 'settled' ||
      amountSuggestion.settledHint === 'covered' ||
      amountSuggestion.suggestedAmountCents <= 0
    ) {
      return
    }
    const nextYuan = centsToYuan(amountSuggestion.suggestedAmountCents)
    form.setFieldsValue({ amountYuan: nextYuan })
    lastSuggestedYuanRef.current = nextYuan
  }

  const canFillSuggestedAmount =
    amountSuggestion != null &&
    amountSuggestion.settledHint !== 'settled' &&
    amountSuggestion.settledHint !== 'covered' &&
    amountSuggestion.suggestedAmountCents > 0

  const partnerExtra = !departureId
    ? '请先选择关联发团'
    : partnersResult && partnersResult.length === 0
      ? '本团暂无关联的合作伙伴'
      : undefined

  const supplierExtra = !departureId
    ? '请先选择关联发团'
    : suppliersResult && suppliersResult.length === 0
      ? '本团暂无关联的供应商'
      : undefined

  const amountExtra =
    amountSuggestion && guestSuggestionEnabled ? (
      <Space size={8} wrap>
        <Typography.Text type="secondary">
          {formatGuestCollectionSuggestionText(amountSuggestion, formatCents)}
        </Typography.Text>
        {canFillSuggestedAmount ? (
          <Button type="link" size="small" onClick={applySuggestedAmount} style={{ padding: 0 }}>
            填入
          </Button>
        ) : null}
      </Space>
    ) : undefined

  const handleDirectionChange = (value: TransactionDirection) => {
    form.setFieldsValue({
      counterpartyType:
        value === TransactionDirection.INFLOW ? CounterpartyType.PARTNER : CounterpartyType.SUPPLIER,
      counterpartyId: undefined,
      counterpartyName: undefined,
    })
    lastSuggestedYuanRef.current = undefined
    lastSuggestedSourceOrderIdRef.current = undefined
  }

  const handleSourceOrderChange = (value: string) => {
    const selected = sourceOrdersResult?.find((item) => item.id === value)
    if (selected && !form.getFieldValue('counterpartyName')) {
      form.setFieldsValue({ counterpartyName: selected.displayName })
    }
  }

  return (
    <Drawer
      title={mode === 'edit' ? '编辑流水' : '新建流水'}
      open={open}
      size={520}
      onClose={handleClose}
      destroyOnHidden
      footer={
        <Space style={{ float: 'right' }}>
          <Button onClick={handleClose}>取消</Button>
          <Button type="primary" loading={loading} onClick={() => form.submit()}>
            {mode === 'edit' ? '保存' : '创建'}
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <TransactionFormDrawerFields
          departureLocked={departureLocked}
          departureId={departureId}
          counterpartyType={counterpartyType}
          departureOptions={departureOptions}
          partnerOptions={partnerOptions}
          supplierOptions={supplierOptions}
          sourceOrderOptions={sourceOrderOptions}
          partnerExtra={partnerExtra}
          supplierExtra={supplierExtra}
          amountExtra={amountExtra}
          onClearCounterparty={clearCounterparty}
          onDirectionChange={handleDirectionChange}
          onSourceOrderChange={handleSourceOrderChange}
        />
      </Form>
    </Drawer>
  )
}
