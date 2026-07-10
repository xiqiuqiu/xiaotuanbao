import { Descriptions } from 'antd'
import type { DescriptionsProps } from 'antd'
import type { ReactNode } from 'react'
import type { PartnerSummary } from '@/types/api'
import {
  DIRECTORY_PROFILE_STATUS_LABELS,
  SETTLEMENT_CYCLE_LABELS,
  SETTLEMENT_METHOD_LABELS,
} from '@/features/directory/catalog'
import {
  PARTNER_CONTACT_ROLE_OPTIONS,
  PARTNER_KIND_LABELS,
  PARTNER_TYPE_LABELS,
  catalogLabel,
} from '../catalog'

interface PartnerReadonlySectionsProps {
  partner: PartnerSummary
}

type DescriptionItem = NonNullable<DescriptionsProps['items']>[number]

const responsiveColumns = { xs: 1, sm: 2, lg: 3 } as const

const PARTNER_CONTACT_ROLE_LABELS = Object.fromEntries(
  PARTNER_CONTACT_ROLE_OPTIONS.map((item) => [item.value, item.label]),
) as Record<string, string>

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

export function PartnerReadonlySections({ partner }: PartnerReadonlySectionsProps) {
  return (
    <>
      <ReadonlySection title="基础信息">
        <ProfileDescriptions
          column={responsiveColumns}
          items={[
            { label: '合作伙伴名称', children: partner.name },
            {
              label: '合作伙伴类型',
              children: catalogLabel(PARTNER_TYPE_LABELS, partner.partnerType),
            },
            {
              label: '合作方向',
              children: catalogLabel(PARTNER_KIND_LABELS, partner.partnerKind),
            },
            {
              label: '状态',
              children: DIRECTORY_PROFILE_STATUS_LABELS[partner.status] ?? partner.status,
            },
          ]}
        />
      </ReadonlySection>

      <ReadonlySection title="联系人信息">
        <ProfileDescriptions
          column={{ xs: 1, sm: 2, lg: 3 }}
          items={[
            { label: '主联系人', children: partner.contactName ?? '-' },
            {
              label: '联系人角色',
              children: catalogLabel(PARTNER_CONTACT_ROLE_LABELS, partner.contactRole),
            },
            { label: '联系方式', children: partner.contactPhone ?? '-' },
          ]}
        />
      </ReadonlySection>

      <ReadonlySection title="结算信息">
        <ProfileDescriptions
          column={responsiveColumns}
          items={[
            {
              label: '结算方式',
              children: catalogLabel(SETTLEMENT_METHOD_LABELS, partner.settlementMethod),
            },
            {
              label: '账期规则',
              children: catalogLabel(SETTLEMENT_CYCLE_LABELS, partner.paymentTermRule),
            },
            { label: '结算说明', children: partner.settlementNotes ?? '-', span: 3 },
          ]}
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
