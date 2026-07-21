import type { ReactNode } from 'react'
import { DatePicker, Form, Input, InputNumber, Radio, Select } from 'antd'
import type { DefaultOptionType } from 'antd/es/select'
import { CounterpartyType, TransactionDirection } from '@xiaotuanbao/shared'
import {
  COUNTERPARTY_TYPE_OPTIONS,
  PAYMENT_CHANNEL_OPTIONS,
  TRANSACTION_DIRECTION_OPTIONS,
} from '../catalog'
interface TransactionFormDrawerFieldsProps {
  departureLocked: boolean
  departureId: string | undefined
  counterpartyType: CounterpartyType | undefined
  departureOptions: DefaultOptionType[]
  partnerOptions: DefaultOptionType[]
  supplierOptions: DefaultOptionType[]
  sourceOrderOptions: DefaultOptionType[]
  partnerExtra: string | undefined
  supplierExtra: string | undefined
  amountExtra: ReactNode
  onClearCounterparty: () => void
  onDirectionChange: (direction: TransactionDirection) => void
  onSourceOrderChange: (value: string) => void
}

export function TransactionFormDrawerFields({
  departureLocked,
  departureId,
  counterpartyType,
  departureOptions,
  partnerOptions,
  supplierOptions,
  sourceOrderOptions,
  partnerExtra,
  supplierExtra,
  amountExtra,
  onClearCounterparty,
  onDirectionChange,
  onSourceOrderChange,
}: TransactionFormDrawerFieldsProps) {
  return (
    <>
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
            onClearCounterparty()
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
            onDirectionChange(event.target.value as TransactionDirection)
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
            onClearCounterparty()
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
              onChange={onSourceOrderChange}
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
    </>
  )
}
