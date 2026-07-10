import { useEffect, useMemo } from 'react'
import { DatePicker, Drawer, Form, Input, InputNumber, Radio, Select, Space, Button } from 'antd'
import type { FormInstance } from 'antd/es/form'
import { useQuery } from '@tanstack/react-query'
import {
  CounterpartyType,
  DirectoryProfileStatus,
  TransactionDirection,
  type FinanceTransactionSummary,
} from '@xiaotuanbao/shared'
import { listDepartures } from '@/services/departure.service'
import { listPartners } from '@/services/partner.service'
import { listSuppliers } from '@/services/supplier.service'
import {
  COUNTERPARTY_TYPE_OPTIONS,
  PAYMENT_CHANNEL_OPTIONS,
  TRANSACTION_DIRECTION_OPTIONS,
} from '../catalog'
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
  onClose: () => void
  onSubmit: (values: TransactionFormValues) => void
}

export function TransactionFormDrawer({
  open,
  mode,
  editingTransaction,
  loading,
  form,
  onClose,
  onSubmit,
}: TransactionFormDrawerProps) {
  const counterpartyType = Form.useWatch('counterpartyType', form)

  // Memoize so the open-seed effect does not re-run on every render (e.g. when
  // useWatch(counterpartyType) updates) and wipe the user's Select choice.
  const initialValues = useMemo(
    () =>
      mode === 'edit' && editingTransaction
        ? transactionToFormValues(editingTransaction)
        : createEmptyTransactionFormValues(),
    [mode, editingTransaction],
  )

  useEffect(() => {
    if (!open) {
      return
    }

    form.resetFields()
    form.setFieldsValue(initialValues)
  }, [form, initialValues, open])

  const { data: departuresResult } = useQuery({
    queryKey: ['departures', 'transaction-form'],
    queryFn: () => listDepartures({ pageSize: 100 }),
    enabled: open,
  })

  const { data: partnersResult } = useQuery({
    queryKey: ['partners', 'transaction-form-select'],
    queryFn: () =>
      listPartners({
        status: DirectoryProfileStatus.ACTIVE,
        pageSize: 100,
      }),
    enabled: open && counterpartyType === CounterpartyType.PARTNER,
  })

  const { data: suppliersResult } = useQuery({
    queryKey: ['suppliers', 'transaction-form-select'],
    queryFn: () =>
      listSuppliers({
        status: DirectoryProfileStatus.ACTIVE,
        pageSize: 100,
      }),
    enabled: open && counterpartyType === CounterpartyType.SUPPLIER,
  })

  const departureOptions =
    departuresResult?.items.map((departure) => ({
      value: departure.id,
      label: `${departure.departureNo} · ${departure.name}`,
    })) ?? []

  const partnerOptions =
    partnersResult?.items.map((partner) => ({
      value: partner.id,
      label: partner.name,
    })) ?? []

  const supplierOptions =
    suppliersResult?.items.map((supplier) => ({
      value: supplier.id,
      label: supplier.name,
    })) ?? []

  const handleClose = () => {
    form.resetFields()
    onClose()
  }

  return (
    <Drawer
      title={mode === 'edit' ? '编辑流水' : '新建流水'}
      open={open}
      width={520}
      onClose={handleClose}
      destroyOnClose
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
          name="direction"
          label="收支方向"
          rules={[{ required: true, message: '请选择收支方向' }]}
        >
          <Radio.Group
            block
            optionType="button"
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
              form.setFieldsValue({
                counterpartyId: undefined,
                counterpartyName: undefined,
              })
            }}
          />
        </Form.Item>
        {counterpartyType === CounterpartyType.PARTNER ? (
          <Form.Item
            name="counterpartyId"
            label="合作伙伴"
            rules={[{ required: true, message: '请选择合作伙伴' }]}
          >
            <Select
              showSearch
              placeholder="选择合作伙伴"
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
          >
            <Select
              showSearch
              placeholder="选择供应商"
              optionFilterProp="label"
              options={supplierOptions}
            />
          </Form.Item>
        ) : null}
        {counterpartyType === CounterpartyType.GUEST ||
        counterpartyType === CounterpartyType.MANUAL ? (
          <Form.Item name="counterpartyName" label="往来对象名称">
            <Input maxLength={100} />
          </Form.Item>
        ) : null}
        <Form.Item name="departureId" label="关联发团">
          <Select
            allowClear
            showSearch
            placeholder="可选"
            options={departureOptions}
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item name="notes" label="备注">
          <Input.TextArea rows={3} maxLength={200} showCount />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
