import { Collapse, Form, Input, Select } from 'antd'
import type { FormInstance } from 'antd/es/form'
import type { ReactNode } from 'react'
import {
  DirectoryProfileStatus,
  InvoiceAvailable,
  type InvoiceType,
  type SettlementCycle,
  type SettlementMethod,
  type SupplierAllowedResourceKind,
} from '@xiaotuanbao/shared'
import {
  DIRECTORY_PROFILE_STATUS_OPTIONS,
  INVOICE_AVAILABLE_OPTIONS,
  INVOICE_TYPE_OPTIONS,
  SETTLEMENT_CYCLE_OPTIONS,
  SETTLEMENT_METHOD_OPTIONS,
  SUPPLIER_CATEGORY_OPTIONS,
} from '../catalog'

export interface SupplierFormValues {
  name: string
  categories: SupplierAllowedResourceKind[]
  status?: DirectoryProfileStatus
  contactName?: string
  contactPhone?: string
  settlementMethod?: SettlementMethod
  settlementCycle?: SettlementCycle
  settlementNotes?: string
  referenceQuoteNotes?: string
  invoiceAvailable?: InvoiceAvailable
  invoiceType?: InvoiceType
  taxRate?: string
  accountName?: string
  bankName?: string
  bankAccount?: string
  businessNotes?: string
}

interface SupplierProfileSectionsProps {
  form: FormInstance<SupplierFormValues>
  showStatus?: boolean
}

export function SupplierProfileSections({ form, showStatus = false }: SupplierProfileSectionsProps) {
  const invoiceAvailable = Form.useWatch('invoiceAvailable', form)
  const invoiceDisabled = invoiceAvailable === InvoiceAvailable.NO

  return (
    <>
      <TypographySection title="基础信息">
        <Form.Item
          label="供应商名称"
          name="name"
          rules={[{ required: true, message: '请输入供应商名称' }]}
        >
          <Input placeholder="例如：西湖国宾馆" />
        </Form.Item>
        <Form.Item
          label="供应商类别"
          name="categories"
          rules={[{ required: true, type: 'array', min: 1, message: '请选择供应商类别' }]}
        >
          <Select
            mode="multiple"
            options={[...SUPPLIER_CATEGORY_OPTIONS]}
            placeholder="请选择类别（可多选）"
          />
        </Form.Item>
        {showStatus ? (
          <Form.Item label="状态" name="status" rules={[{ required: true, message: '请选择状态' }]}>
            <Select options={[...DIRECTORY_PROFILE_STATUS_OPTIONS]} />
          </Form.Item>
        ) : null}
      </TypographySection>

      <TypographySection title="联系信息">
        <Form.Item label="主联系人" name="contactName">
          <Input placeholder="例如：张经理" />
        </Form.Item>
        <Form.Item label="联系方式" name="contactPhone">
          <Input placeholder="例如：13800138000" />
        </Form.Item>
      </TypographySection>

      <TypographySection title="结算信息">
        <Form.Item label="结算方式" name="settlementMethod">
          <Select allowClear options={[...SETTLEMENT_METHOD_OPTIONS]} placeholder="可选" />
        </Form.Item>
        <Form.Item label="账期规则" name="settlementCycle">
          <Select allowClear options={[...SETTLEMENT_CYCLE_OPTIONS]} placeholder="可选" />
        </Form.Item>
        <Form.Item label="结算说明" name="settlementNotes">
          <Input.TextArea rows={2} placeholder="例如：出团后 7 个工作日结" />
        </Form.Item>
        <Form.Item label="参考报价说明" name="referenceQuoteNotes">
          <Input.TextArea rows={2} placeholder="例如：人均价、含餐、淡旺季说明" />
        </Form.Item>
      </TypographySection>

      <Collapse
        defaultActiveKey={[]}
        items={[
          {
            key: 'financial',
            label: '更多财务信息',
            children: (
              <>
                <Form.Item label="是否可开票" name="invoiceAvailable">
                  <Select allowClear options={[...INVOICE_AVAILABLE_OPTIONS]} placeholder="可选" />
                </Form.Item>
                <Form.Item label="发票类型" name="invoiceType">
                  <Select
                    allowClear
                    disabled={invoiceDisabled}
                    options={[...INVOICE_TYPE_OPTIONS]}
                    placeholder="可选"
                  />
                </Form.Item>
                <Form.Item label="税率" name="taxRate">
                  <Input disabled={invoiceDisabled} placeholder="例如：3%" />
                </Form.Item>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>收款账户信息</div>
                <Form.Item label="开户名称" name="accountName">
                  <Input placeholder="可选" />
                </Form.Item>
                <Form.Item label="开户行" name="bankName">
                  <Input placeholder="可选" />
                </Form.Item>
                <Form.Item label="银行账号" name="bankAccount">
                  <Input placeholder="可选" />
                </Form.Item>
              </>
            ),
          },
        ]}
        style={{ marginBottom: 16 }}
      />

      <TypographySection title="备注">
        <Form.Item label="备注" name="businessNotes">
          <Input.TextArea
            rows={3}
            placeholder="例如：最大接待 200 人，支持临时加单……"
          />
        </Form.Item>
      </TypographySection>
    </>
  )
}

function TypographySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}
