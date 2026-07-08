import { DatePicker, Drawer, Form, Input, InputNumber, Select, Space, Button } from 'antd'
import type { FormInstance } from 'antd/es/form'
import { useQuery } from '@tanstack/react-query'
import { CounterpartyType, PaymentChannel, TransactionDirection } from '@xiaotuanbao/shared'
import { listDepartures } from '@/services/departure.service'
import {
  COUNTERPARTY_TYPE_OPTIONS,
  PAYMENT_CHANNEL_OPTIONS,
  TRANSACTION_DIRECTION_OPTIONS,
} from '../catalog'
import type { TransactionFormValues } from '../utils/transaction-form'

interface TransactionFormDrawerProps {
  open: boolean
  loading: boolean
  form: FormInstance<TransactionFormValues>
  onClose: () => void
  onSubmit: (values: TransactionFormValues) => void
}

export function TransactionFormDrawer({
  open,
  loading,
  form,
  onClose,
  onSubmit,
}: TransactionFormDrawerProps) {
  const { data: departuresResult } = useQuery({
    queryKey: ['departures', 'transaction-form'],
    queryFn: () => listDepartures({ pageSize: 100 }),
    enabled: open,
  })

  const departureOptions =
    departuresResult?.items.map((departure) => ({
      value: departure.id,
      label: `${departure.departureNo} · ${departure.name}`,
    })) ?? []

  return (
    <Drawer
      title="新建流水"
      open={open}
      width={520}
      onClose={onClose}
      footer={
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={loading} onClick={() => form.submit()}>
            创建
          </Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          direction: TransactionDirection.INFLOW,
          paymentChannel: PaymentChannel.CASH,
          counterpartyType: CounterpartyType.PARTNER,
        }}
        onFinish={onSubmit}
      >
        <Form.Item
          name="direction"
          label="方向"
          rules={[{ required: true, message: '请选择方向' }]}
        >
          <Select options={[...TRANSACTION_DIRECTION_OPTIONS]} />
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
          <Select options={[...COUNTERPARTY_TYPE_OPTIONS]} />
        </Form.Item>
        <Form.Item name="counterpartyName" label="往来对象名称">
          <Input maxLength={100} />
        </Form.Item>
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
