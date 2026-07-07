import { Form, Input, InputNumber, Modal, Select } from 'antd'
import type { FormInstance } from 'antd/es/form'
import { useQuery } from '@tanstack/react-query'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { listTransactions } from '@/services/finance.service'
import { formatCents } from '../catalog'
import type { LinkTransactionFormValues } from '../utils/link-transaction-form'

interface LinkTransactionModalProps {
  open: boolean
  schedule: PaymentScheduleSummary | null
  loading: boolean
  form: FormInstance<LinkTransactionFormValues>
  onClose: () => void
  onSubmit: (values: LinkTransactionFormValues) => void
}

export function LinkTransactionModal({
  open,
  schedule,
  loading,
  form,
  onClose,
  onSubmit,
}: LinkTransactionModalProps) {
  const { data: transactionsResult, isLoading } = useQuery({
    queryKey: ['finance-transactions', 'link', schedule?.departureId, schedule?.counterpartyType],
    queryFn: () =>
      listTransactions({
        departureId: schedule?.departureId,
        pageSize: 100,
      }),
    enabled: open && Boolean(schedule),
  })

  const matchingTransactions =
    transactionsResult?.items.filter(
      (transaction) =>
        !transaction.voidedAt &&
        transaction.unallocatedAmountCents > 0 &&
        transaction.counterpartyType === schedule?.counterpartyType &&
        (schedule?.counterpartyId
          ? transaction.counterpartyId === schedule.counterpartyId
          : transaction.counterpartyName === schedule?.counterpartyName),
    ) ?? []

  return (
    <Modal
      title="关联流水"
      open={open}
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="关联"
      cancelText="取消"
      destroyOnClose
    >
      {schedule ? (
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item label="账款节点">
            <Input value={`${schedule.scheduleNo} · ${schedule.title}`} disabled />
          </Form.Item>
          <Form.Item
            name="transactionId"
            label="财务流水"
            rules={[{ required: true, message: '请选择流水' }]}
          >
            <Select
              showSearch
              loading={isLoading}
              placeholder="选择往来对象匹配的流水"
              options={matchingTransactions.map((transaction) => ({
                value: transaction.id,
                label: `${transaction.transactionNo} · ${formatCents(transaction.unallocatedAmountCents)} 可分配`,
              }))}
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item
            name="amountYuan"
            label="关联金额（元）"
            rules={[{ required: true, message: '请输入关联金额' }]}
          >
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      ) : null}
    </Modal>
  )
}
