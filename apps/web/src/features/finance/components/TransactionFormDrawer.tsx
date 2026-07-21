import { useEffect, useMemo, useRef, useState } from 'react'
import { DatePicker, Drawer, Form, Input, InputNumber, Radio, Select, Space, Button, Typography } from 'antd'
import type { FormInstance } from 'antd/es/form'
import { useQuery } from '@tanstack/react-query'
import {
  CounterpartyType,
  TransactionDirection,
  type FinanceTransactionSummary,
} from '@xiaotuanbao/shared'
import {
  listDepartureReceivables,
  listFinanceDepartureOptions,
  listFinancePartnerOptions,
  listFinanceSourceOrderOptions,
  listFinanceSupplierOptions,
  listTransactions,
} from '@/services/finance.service'
import { getSourceOrder } from '@/services/source-order.service'
import {
  COUNTERPARTY_TYPE_OPTIONS,
  PAYMENT_CHANNEL_OPTIONS,
  TRANSACTION_DIRECTION_OPTIONS,
  formatCents,
} from '../catalog'
import { centsToYuan } from '../utils/finance-form'
import {
  formatGuestCollectionSuggestionText,
  resolveGuestCollectionAmountSuggestion,
  shouldReplaceSuggestedAmount,
  sumExistingUnallocatedGuestCents,
} from '../utils/transaction-amount-suggestion'
import {
  createEmptyTransactionFormValues,
  transactionToFormValues,
  type TransactionFormValues,
} from '../utils/transaction-form'

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
  const [lastSuggestedYuan, setLastSuggestedYuan] = useState<number | undefined>()
  const lastSuggestedSourceOrderIdRef = useRef<string | undefined>(undefined)

  // Memoize so the open-seed effect does not re-run on every render (e.g. when
  // useWatch(counterpartyType) updates) and wipe the user's Select choice.
  const initialValues = useMemo(() => {
    if (mode === 'edit' && editingTransaction) {
      return transactionToFormValues(editingTransaction)
    }
    const empty = createEmptyTransactionFormValues()
    if (lockedDepartureId) {
      return { ...empty, departureId: lockedDepartureId }
    }
    return empty
  }, [mode, editingTransaction, lockedDepartureId])

  useEffect(() => {
    if (!open) {
      return
    }

    form.resetFields()
    form.setFieldsValue(initialValues)
    setLastSuggestedYuan(undefined)
    lastSuggestedSourceOrderIdRef.current = undefined
  }, [form, initialValues, open])

  const { data: departuresResult } = useQuery({
    queryKey: ['departures', 'transaction-form'],
    queryFn: listFinanceDepartureOptions,
    enabled: open,
  })

  const { data: partnersResult } = useQuery({
    queryKey: ['partners', 'transaction-form-select', departureId],
    queryFn: () => listFinancePartnerOptions(departureId!),
    enabled: open && counterpartyType === CounterpartyType.PARTNER && Boolean(departureId),
  })

  const { data: suppliersResult } = useQuery({
    queryKey: ['suppliers', 'transaction-form-select', departureId],
    queryFn: () => listFinanceSupplierOptions(departureId!),
    enabled: open && counterpartyType === CounterpartyType.SUPPLIER && Boolean(departureId),
  })

  const { data: sourceOrdersResult } = useQuery({
    queryKey: ['source-orders', 'transaction-form-select', departureId],
    queryFn: () => listFinanceSourceOrderOptions(departureId!),
    enabled: open && counterpartyType === CounterpartyType.GUEST && Boolean(departureId),
  })

  const guestSuggestionEnabled =
    open &&
    direction === TransactionDirection.INFLOW &&
    counterpartyType === CounterpartyType.GUEST &&
    Boolean(departureId) &&
    Boolean(counterpartyId)

  const { data: amountSuggestion } = useQuery({
    queryKey: [
      'transaction-form',
      'guest-amount-suggestion',
      departureId,
      counterpartyId,
      editingTransaction?.id,
    ],
    queryFn: async () => {
      const [receivables, sourceOrder, transactions] = await Promise.all([
        listDepartureReceivables(departureId!, {
          counterpartyType: CounterpartyType.GUEST,
          counterpartyId: counterpartyId!,
          pageSize: 20,
        }),
        getSourceOrder(counterpartyId!),
        listTransactions({
          departureId: departureId!,
          status: 'normal',
          pageSize: 100,
        }),
      ])
      const existingUnallocatedGuestCents = sumExistingUnallocatedGuestCents({
        transactions: transactions.items,
        sourceOrderId: counterpartyId!,
        excludeTransactionId: editingTransaction?.id,
      })
      return resolveGuestCollectionAmountSuggestion({
        schedules: receivables.items,
        guestCollectCents: sourceOrder.guestCollectCents,
        existingUnallocatedGuestCents,
      })
    },
    enabled: guestSuggestionEnabled,
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
      setLastSuggestedYuan(undefined)
      return
    }

    const currentYuan = form.getFieldValue('amountYuan') as number | undefined
    if (
      shouldReplaceSuggestedAmount({
        currentYuan,
        previousSuggestedYuan: lastSuggestedYuan,
      })
    ) {
      const nextYuan = centsToYuan(amountSuggestion.suggestedAmountCents)
      form.setFieldsValue({ amountYuan: nextYuan })
      setLastSuggestedYuan(nextYuan)
    }
  }, [amountSuggestion, counterpartyId, form, lastSuggestedYuan])

  const departureOptions =
    departuresResult?.map((departure) => ({
      value: departure.id,
      label: `${departure.departureNo} · ${departure.name}`,
    })) ?? []

  const partnerOptions = useMemo(() => {
    const options =
      partnersResult?.map((partner) => ({
        value: partner.id,
        label: partner.name,
      })) ?? []
    if (
      mode === 'edit' &&
      editingTransaction?.counterpartyType === CounterpartyType.PARTNER &&
      editingTransaction.counterpartyId &&
      !options.some((option) => option.value === editingTransaction.counterpartyId)
    ) {
      return [
        {
          value: editingTransaction.counterpartyId,
          label: editingTransaction.counterpartyName ?? editingTransaction.counterpartyId,
        },
        ...options,
      ]
    }
    return options
  }, [partnersResult, mode, editingTransaction])

  const supplierOptions = useMemo(() => {
    const options =
      suppliersResult?.map((supplier) => ({
        value: supplier.id,
        label: supplier.name,
      })) ?? []
    if (
      mode === 'edit' &&
      editingTransaction?.counterpartyType === CounterpartyType.SUPPLIER &&
      editingTransaction.counterpartyId &&
      !options.some((option) => option.value === editingTransaction.counterpartyId)
    ) {
      return [
        {
          value: editingTransaction.counterpartyId,
          label: editingTransaction.counterpartyName ?? editingTransaction.counterpartyId,
        },
        ...options,
      ]
    }
    return options
  }, [suppliersResult, mode, editingTransaction])

  const sourceOrderOptions =
    sourceOrdersResult?.map((sourceOrder) => ({
      value: sourceOrder.id,
      label: sourceOrder.displayName,
    })) ?? []

  const handleClose = () => {
    form.resetFields()
    setLastSuggestedYuan(undefined)
    lastSuggestedSourceOrderIdRef.current = undefined
    onClose()
  }

  const clearCounterparty = () => {
    form.setFieldsValue({
      counterpartyId: undefined,
      counterpartyName: undefined,
    })
    setLastSuggestedYuan(undefined)
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
    setLastSuggestedYuan(nextYuan)
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
        <Form.Item
          name="departureId"
          label="关联发团"
          rules={[{ required: true, message: '请选择关联发团' }]}
        >
          <Select
            allowClear={!departureLocked}
            showSearch
            disabled={departureLocked}
            placeholder="请先选择发团"
            options={departureOptions}
            optionFilterProp="label"
            onChange={() => {
              clearCounterparty()
            }}
          />
        </Form.Item>
        <Form.Item
          name="direction"
          label="收支方向"
          rules={[{ required: true, message: '请选择收支方向' }]}
        >
          <Radio.Group
            block
            optionType="button"
            buttonStyle="solid"
            options={[...TRANSACTION_DIRECTION_OPTIONS]}
            onChange={(event) => {
              const value = event.target.value as TransactionDirection
              form.setFieldsValue({
                counterpartyType:
                  value === TransactionDirection.INFLOW
                    ? CounterpartyType.PARTNER
                    : CounterpartyType.SUPPLIER,
                counterpartyId: undefined,
                counterpartyName: undefined,
              })
              setLastSuggestedYuan(undefined)
              lastSuggestedSourceOrderIdRef.current = undefined
            }}
          />
        </Form.Item>
        <Form.Item
          name="paymentChannel"
          label="收付款通道"
          rules={[{ required: true, message: '请选择收付款通道' }]}
        >
          <Select options={[...PAYMENT_CHANNEL_OPTIONS]} />
        </Form.Item>
        <Form.Item
          name="amountYuan"
          label="金额（元）"
          rules={[{ required: true, message: '请输入金额' }]}
          extra={amountExtra}
        >
          <InputNumber min={0.01} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="transactionDate"
          label="交易日期"
          rules={[{ required: true, message: '请选择交易日期' }]}
        >
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="counterpartyType"
          label="往来对象类型"
          rules={[{ required: true, message: '请选择往来对象类型' }]}
        >
          <Select
            options={[...COUNTERPARTY_TYPE_OPTIONS]}
            onChange={() => {
              clearCounterparty()
            }}
          />
        </Form.Item>
        {counterpartyType === CounterpartyType.PARTNER ? (
          <Form.Item
            name="counterpartyId"
            label="合作伙伴"
            rules={[{ required: true, message: '请选择合作伙伴' }]}
            extra={partnerExtra}
          >
            <Select
              showSearch
              disabled={!departureId}
              placeholder={departureId ? '选择合作伙伴' : '请先选择关联发团'}
              optionFilterProp="label"
              options={partnerOptions}
            />
          </Form.Item>
        ) : null}
        {counterpartyType === CounterpartyType.SUPPLIER ? (
          <Form.Item
            name="counterpartyId"
            label="供应商"
            rules={[{ required: true, message: '请选择供应商' }]}
            extra={supplierExtra}
          >
            <Select
              showSearch
              disabled={!departureId}
              placeholder={departureId ? '选择供应商' : '请先选择关联发团'}
              optionFilterProp="label"
              options={supplierOptions}
            />
          </Form.Item>
        ) : null}
        {counterpartyType === CounterpartyType.GUEST ? (
          <>
            <Form.Item
              name="counterpartyId"
              label="关联客源单"
              rules={[{ required: true, message: '请选择关联客源单' }]}
              extra={!departureId ? '请先选择关联发团' : undefined}
            >
              <Select
                showSearch
                disabled={!departureId}
                placeholder={departureId ? '选择客源单' : '请先选择关联发团'}
                optionFilterProp="label"
                options={sourceOrderOptions}
                onChange={(value: string) => {
                  const selected = sourceOrdersResult?.find((item) => item.id === value)
                  if (selected && !form.getFieldValue('counterpartyName')) {
                    form.setFieldsValue({ counterpartyName: selected.displayName })
                  }
                }}
              />
            </Form.Item>
            <Form.Item
              name="counterpartyName"
              label="往来对象名称"
              extra="可填写客人姓名；核销按客源单匹配，不依赖此名称"
            >
              <Input maxLength={100} placeholder="可选，如客人姓名" />
            </Form.Item>
          </>
        ) : null}
        <Form.Item name="notes" label="备注">
          <Input.TextArea rows={3} maxLength={200} showCount />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
