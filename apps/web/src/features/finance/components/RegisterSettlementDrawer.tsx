import { Col, DatePicker, Divider, Drawer, Form, Input, InputNumber, Row, Select, Space, Button, Typography } from 'antd'
import type { FormInstance } from 'antd/es/form'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { PAYMENT_CHANNEL_OPTIONS, catalogLabel, COUNTERPARTY_TYPE_LABELS, formatCents } from '../catalog'
import { centsToYuan, yuanToCents } from '../utils/finance-form'
import type { RegisterSettlementFormValues } from '../utils/register-settlement-form'

type RegisterSettlementVariant = 'payment' | 'collection'

const COPY: Record<
  RegisterSettlementVariant,
  {
    title: string
    scheduleNoLabel: string
    counterpartyLabel: string
    totalLabel: string
    settledLabel: string
    unsettledLabel: string
    postUnsettledLabel: string
    amountLabel: string
    channelLabel: string
    hint: string
    submitLabel: string
  }
> = {
  payment: {
    title: '登记付款',
    scheduleNoLabel: '应付单号',
    counterpartyLabel: '供应商',
    totalLabel: '应付总额',
    settledLabel: '已付',
    unsettledLabel: '未付',
    postUnsettledLabel: '核销后未付',
    amountLabel: '付款金额（元）',
    channelLabel: '付款通道',
    hint: '确认后将生成一条支出流水，并自动完成本次核销',
    submitLabel: '确认付款并核销',
  },
  collection: {
    title: '登记收款',
    scheduleNoLabel: '应收单号',
    counterpartyLabel: '客户',
    totalLabel: '应收总额',
    settledLabel: '已收',
    unsettledLabel: '未收',
    postUnsettledLabel: '核销后未收',
    amountLabel: '收款金额（元）',
    channelLabel: '收款通道',
    hint: '确认后将生成一条收入流水，并自动完成本次核销',
    submitLabel: '确认收款并核销',
  },
}

interface RegisterSettlementDrawerProps {
  variant: RegisterSettlementVariant
  open: boolean
  schedule: PaymentScheduleSummary | null
  departureMap: Map<string, { departureNo: string; name: string }>
  loading: boolean
  form: FormInstance<RegisterSettlementFormValues>
  onClose: () => void
  onSubmit: (values: RegisterSettlementFormValues) => void
}

function formatDepartureLabel(
  schedule: PaymentScheduleSummary,
  departureMap: Map<string, { departureNo: string; name: string }>,
): string {
  const departure = departureMap.get(schedule.departureId)
  if (!departure) {
    return '-'
  }
  return `${departure.departureNo} · ${departure.name}`
}

function formatCounterpartyLabel(schedule: PaymentScheduleSummary): string {
  const typeLabel = catalogLabel(COUNTERPARTY_TYPE_LABELS, schedule.counterpartyType)
  return schedule.counterpartyName ? `${typeLabel} · ${schedule.counterpartyName}` : typeLabel
}

export function RegisterSettlementDrawer({
  variant,
  open,
  schedule,
  departureMap,
  loading,
  form,
  onClose,
  onSubmit,
}: RegisterSettlementDrawerProps) {
  const copy = COPY[variant]
  const amountYuan = Form.useWatch('amountYuan', form)
  const postUnsettledCents =
    schedule && typeof amountYuan === 'number'
      ? Math.max(schedule.unsettledAmountCents - yuanToCents(amountYuan), 0)
      : (schedule?.unsettledAmountCents ?? 0)

  return (
    <Drawer
      title={copy.title}
      open={open}
      size="min(520px, 100vw)"
      onClose={onClose}
      footer={
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={loading} onClick={() => form.submit()}>
            {copy.submitLabel}
          </Button>
        </Space>
      }
    >
      {schedule ? (
        <>
          <Form form={form} layout="vertical" onFinish={onSubmit}>
            <Form.Item label={copy.scheduleNoLabel}>
              <Input value={schedule.scheduleNo} disabled />
            </Form.Item>
            <Form.Item label="标题">
              <Input value={schedule.title} disabled />
            </Form.Item>
            <Form.Item label="关联团单">
              <Input value={formatDepartureLabel(schedule, departureMap)} disabled />
            </Form.Item>
            <Form.Item label={copy.counterpartyLabel}>
              <Input value={formatCounterpartyLabel(schedule)} disabled />
            </Form.Item>

            <Row gutter={16}>
              <Col xs={24} sm={8}>
                <Form.Item label={copy.totalLabel}>
                  <Input value={formatCents(schedule.amountCents)} disabled />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label={copy.settledLabel}>
                  <Input value={formatCents(schedule.settledAmountCents)} disabled />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label={copy.unsettledLabel}>
                  <Input value={formatCents(schedule.unsettledAmountCents)} disabled />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item label={copy.postUnsettledLabel}>
              <Input value={formatCents(postUnsettledCents)} disabled />
            </Form.Item>

            <Divider style={{ margin: '8px 0 16px' }} />

            <Form.Item
              name="amountYuan"
              label={copy.amountLabel}
              rules={[
                { required: true, message: '请输入金额' },
                {
                  validator: (_, value) => {
                    if (value == null || value <= 0) {
                      return Promise.reject(new Error('金额必须大于 0'))
                    }
                    const maxYuan = centsToYuan(schedule.unsettledAmountCents)
                    if (value > maxYuan) {
                      return Promise.reject(new Error(`金额不能超过${copy.unsettledLabel}金额`))
                    }
                    return Promise.resolve()
                  },
                },
              ]}
            >
              <InputNumber min={0.01} precision={2} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="paymentChannel"
              label={copy.channelLabel}
              rules={[{ required: true, message: '请选择收付款通道' }]}
            >
              <Select options={[...PAYMENT_CHANNEL_OPTIONS]} />
            </Form.Item>
            <Form.Item
              name="transactionDate"
              label="交易日期"
              rules={[{ required: true, message: '请选择交易日期' }]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="notes" label="流水备注">
              <Input.TextArea rows={3} maxLength={200} showCount />
            </Form.Item>
          </Form>

          <Typography.Text type="secondary">{copy.hint}</Typography.Text>
        </>
      ) : null}
    </Drawer>
  )
}
