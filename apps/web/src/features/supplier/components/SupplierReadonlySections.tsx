import { Descriptions } from 'antd'
import type { DescriptionsProps } from 'antd'
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

type DescriptionItem = NonNullable<DescriptionsProps['items']>[number]

const responsiveColumns = { xs: 1, sm: 2, lg: 3 } as const

function ProfileDescriptions({
  column,
  items,
}: {
  column: DescriptionsProps['column']
  items: DescriptionItem[]
}) {
  return (
    <Descriptions layout="vertical" bordered size="small" column={column} items={items} />
  )
}

export function SupplierReadonlySections({ supplier }: SupplierReadonlySectionsProps) {
  const invoiceDisabled = supplier.invoiceAvailable === InvoiceAvailable.NO

  return (
    <>
      <ReadonlySection title="基础信息">
        <ProfileDescriptions
          column={responsiveColumns}
          items={[
            { label: '供应商名称', children: supplier.name },
            {
              label: '供应商类别',
              children: catalogLabel(SUPPLIER_CATEGORY_LABELS, supplier.category),
            },
            {
              label: '状态',
              children: DIRECTORY_PROFILE_STATUS_LABELS[supplier.status] ?? supplier.status,
            },
          ]}
        />
      </ReadonlySection>

      <ReadonlySection title="联系信息">
        <ProfileDescriptions
          column={{ xs: 1, sm: 2 }}
          items={[
            { label: '主联系人', children: supplier.contactName ?? '—' },
            { label: '联系方式', children: supplier.contactPhone ?? '—' },
          ]}
        />
      </ReadonlySection>

      <ReadonlySection title="结算信息">
        <ProfileDescriptions
          column={responsiveColumns}
          items={[
            {
              label: '结算方式',
              children: catalogLabel(SETTLEMENT_METHOD_LABELS, supplier.settlementMethod),
            },
            {
              label: '账期规则',
              children: catalogLabel(SETTLEMENT_CYCLE_LABELS, supplier.settlementCycle),
            },
            { label: '结算说明', children: supplier.settlementNotes ?? '—', span: 3 },
            { label: '参考报价说明', children: supplier.referenceQuoteNotes ?? '—', span: 3 },
          ]}
        />
      </ReadonlySection>

      <ReadonlySection title="更多财务信息">
        <ProfileDescriptions
          column={responsiveColumns}
          items={[
            {
              label: '是否可开票',
              children: catalogLabel(INVOICE_AVAILABLE_LABELS, supplier.invoiceAvailable),
            },
            {
              label: '发票类型',
              children: invoiceDisabled ? '—' : catalogLabel(INVOICE_TYPE_LABELS, supplier.invoiceType),
            },
            {
              label: '税率',
              children: invoiceDisabled ? '—' : (supplier.taxRate ?? '—'),
            },
          ]}
        />
      </ReadonlySection>

      <ReadonlySection title="收款账户信息">
        <ProfileDescriptions
          column={responsiveColumns}
          items={[
            { label: '开户名称', children: supplier.accountName ?? '—' },
            { label: '开户行', children: supplier.bankName ?? '—' },
            { label: '银行账号', children: supplier.bankAccount ?? '—' },
          ]}
        />
      </ReadonlySection>

      <ReadonlySection title="备注">
        <ProfileDescriptions
          column={1}
          items={[{ label: '备注', children: supplier.businessNotes ?? '—' }]}
        />
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
