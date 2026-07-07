import { Form, InputNumber, Modal, Select } from 'antd'
import type { FormInstance } from 'antd/es/form'
import { useQuery } from '@tanstack/react-query'
import {
  listPayables,
  listReceivables,
  listTransactions,
} from '@/services/finance.service'
import { formatCents } from '../catalog'
import type { VerificationFormValues } from '../utils/verification-form'

interface VerificationFormDrawerProps {
  open: boolean
  loading: boolean
  form: FormInstance<VerificationFormValues>
  onClose: () => void
  onSubmit: (values: VerificationFormValues) => void
}

export function VerificationFormDrawer({
  open,
  loading,
  form,
  onClose,
  onSubmit,
}: VerificationFormDrawerProps) {
  const { data: receivablesResult } = useQuery({
    queryKey: ['finance-receivables', 'verification-form'],
    queryFn: () => listReceivables({ pageSize: 100 }),
    enabled: open,
  })

  const { data: payablesResult } = useQuery({
    queryKey: ['finance-payables', 'verification-form'],
    queryFn: () => listPayables({ pageSize: 100 }),
    enabled: open,
  })

  const { data: transactionsResult } = useQuery({
    queryKey: ['finance-transactions', 'verification-form'],
    queryFn: () => listTransactions({ pageSize: 100 }),
    enabled: open,
  })

  const scheduleOptions = [...(receivablesResult?.items ?? []), ...(payablesResult?.items ?? [])]
    .filter((schedule) => schedule.unsettledAmountCents > 0 && !schedule.cancelledAt)
    .map((schedule) => ({
      value: schedule.id,
      label: `${schedule.scheduleNo} · ${schedule.title} · 未结清 ${formatCents(schedule.unsettledAmountCents)}`,
    }))

  const transactionOptions =
    transactionsResult?.items
      .filter((transaction) => !transaction.voidedAt && transaction.unallocatedAmountCents > 0)
      .map((transaction) => ({
        value: transaction.id,
        label: `${transaction.transactionNo} · 可分配 ${formatCents(transaction.unallocatedAmountCents)}`,
      })) ?? []

  return (
    <Modal
      title="新建核销"
      open={open}
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="创建"
      cancelText="取消"
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item
          name="paymentScheduleId"
          label="账款节点"
          rules={[{ required: true, message: '请选择账款节点' }]}
        >
          <Select
            showSearch
            placeholder="选择待核销节点"
            options={scheduleOptions}
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item
          name="transactionId"
          label="财务流水"
          rules={[{ required: true, message: '请选择流水' }]}
        >
          <Select
            showSearch
            placeholder="选择流水"
            options={transactionOptions}
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item
          name="amountYuan"
          label="核销金额（元）"
          rules={[{ required: true, message: '请输入核销金额' }]}
        >
          <InputNumber min={0.01} precision={2} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
