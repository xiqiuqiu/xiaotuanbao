import { Collapse, Descriptions } from 'antd'
import type { ReactNode } from 'react'
import { InvoiceAvailable } from '@xiaotuanbao/shared'
import type { SupplierSummary } from '@/types/api'
import {
  DIRECTORY_PROFILE_STATUS_LABELS,
  INVOICE_AVAILABLE_LABELS,
  INVOICE_TYPE_LABELS,
  SETTLEMENT_CYCLE_LABELS,
  SETTLEMENT_METHOD_LABELS,
  SUPPLIER_CATEGORY_LABELS,
  catalogLabel,
} from '../catalog'

interface SupplierReadonlySectionsProps {
  supplier: SupplierSummary
}

export function SupplierReadonlySections({ supplier }: SupplierReadonlySectionsProps) {
  const invoiceDisabled = supplier.invoiceAvailable === InvoiceAvailable.NO

  return (
    <>
      <ReadonlySection title="基础信息">
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="供应商名称">{supplier.name}</Descriptions.Item>
          <Descriptions.Item label="供应商类别">
            {catalogLabel(SUPPLIER_CATEGORY_LABELS, supplier.category)}
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            {DIRECTORY_PROFILE_STATUS_LABELS[supplier.status] ?? supplier.status}
          </Descriptions.Item>
        </Descriptions>
      </ReadonlySection>

      <ReadonlySection title="联系信息">
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="主联系人">{supplier.contactName ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="联系方式">{supplier.contactPhone ?? '—'}</Descriptions.Item>
        </Descriptions>
      </ReadonlySection>

      <ReadonlySection title="结算信息">
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="结算方式">
            {catalogLabel(SETTLEMENT_METHOD_LABELS, supplier.settlementMethod)}
          </Descriptions.Item>
          <Descriptions.Item label="账期规则">
            {catalogLabel(SETTLEMENT_CYCLE_LABELS, supplier.settlementCycle)}
          </Descriptions.Item>
          <Descriptions.Item label="结算说明">{supplier.settlementNotes ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="参考报价说明">
            {supplier.referenceQuoteNotes ?? '—'}
          </Descriptions.Item>
        </Descriptions>
      </ReadonlySection>

      <Collapse
        defaultActiveKey={[]}
        items={[
          {
            key: 'financial',
            label: '更多财务信息',
            children: (
              <>
                <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
                  <Descriptions.Item label="是否可开票">
                    {catalogLabel(INVOICE_AVAILABLE_LABELS, supplier.invoiceAvailable)}
                  </Descriptions.Item>
                  <Descriptions.Item label="发票类型">
                    {invoiceDisabled
                      ? '—'
                      : catalogLabel(INVOICE_TYPE_LABELS, supplier.invoiceType)}
                  </Descriptions.Item>
                  <Descriptions.Item label="税率">
                    {invoiceDisabled ? '—' : (supplier.taxRate ?? '—')}
                  </Descriptions.Item>
                </Descriptions>
                <Collapse
                  defaultActiveKey={[]}
                  items={[
                    {
                      key: 'bank',
                      label: '收款账户信息',
                      children: (
                        <Descriptions column={1} size="small" bordered>
                          <Descriptions.Item label="开户名称">
                            {supplier.accountName ?? '—'}
                          </Descriptions.Item>
                          <Descriptions.Item label="开户行">{supplier.bankName ?? '—'}</Descriptions.Item>
                          <Descriptions.Item label="银行账号">
                            {supplier.bankAccount ?? '—'}
                          </Descriptions.Item>
                        </Descriptions>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
        style={{ marginBottom: 16 }}
      />

      <ReadonlySection title="备注">
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="备注">{supplier.businessNotes ?? '—'}</Descriptions.Item>
        </Descriptions>
      </ReadonlySection>
    </>
  )
}

function ReadonlySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}
