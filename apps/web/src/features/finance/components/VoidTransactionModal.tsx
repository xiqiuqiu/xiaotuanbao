import { Form, Input, Modal } from 'antd'
import type { FormInstance } from 'antd/es/form'
import type { FinanceTransactionSummary } from '@xiaotuanbao/shared'
import { formatCents } from '../catalog'
import {
  counterpartyCollectionMethodText,
  counterpartyDisplayName,
} from '../utils/counterparty-display'

export interface VoidTransactionFormValues {
  voidReason: string
}

interface VoidTransactionModalProps {
  open: boolean
  transaction: FinanceTransactionSummary | null
  loading: boolean
  form: FormInstance<VoidTransactionFormValues>
  onClose: () => void
  onSubmit: (values: VoidTransactionFormValues) => void
}

export function VoidTransactionModal({
  open,
  transaction,
  loading,
  form,
  onClose,
  onSubmit,
}: VoidTransactionModalProps) {
  return (
    <Modal
      title="作废流水"
      open={open}
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="确认作废"
      okType="danger"
      cancelText="取消"
      destroyOnHidden
    >
      {transaction ? (
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item label="流水号">
            <Input value={transaction.transactionNo} disabled />
          </Form.Item>
          <Form.Item label="流水金额">
            <Input value={formatCents(transaction.amountCents)} disabled />
          </Form.Item>
          <Form.Item label="收款方式">
            <Input
              value={counterpartyCollectionMethodText(transaction.counterpartyType)}
              disabled
            />
          </Form.Item>
          <Form.Item label="往来对象">
            <Input
              value={counterpartyDisplayName(transaction.counterpartyName)}
              disabled
            />
          </Form.Item>
          <Form.Item
            name="voidReason"
            label="作废原因"
            rules={[{ required: true, message: '请输入作废原因' }]}
          >
            <Input.TextArea rows={3} maxLength={200} showCount placeholder="请输入作废原因" />
          </Form.Item>
        </Form>
      ) : null}
    </Modal>
  )
}
