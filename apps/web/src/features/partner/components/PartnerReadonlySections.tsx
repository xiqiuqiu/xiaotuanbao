import { Descriptions } from 'antd'
import type { DescriptionsProps } from 'antd'
import type { ReactNode } from 'react'
import type { PartnerSummary } from '@/types/api'
import { EllipsisTooltipText } from '@/components/EllipsisTooltipText'
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
import styles from './PartnerReadonlySections.module.css'

interface PartnerReadonlySectionsProps {
  partner: PartnerSummary
  /** antd Descriptions.extra — 操作区，显示在「基础信息」右上方 */
  extra?: ReactNode
}

type DescriptionItem = NonNullable<DescriptionsProps['items']>[number]

const responsiveColumns = { xs: 1, sm: 2, lg: 3 } as const

const PARTNER_CONTACT_ROLE_LABELS = Object.fromEntries(
  PARTNER_CONTACT_ROLE_OPTIONS.map((item) => [item.value, item.label]),
) as Record<string, string>

function textValue(value: ReactNode): ReactNode {
  if (value === null || value === undefined) {
    return <EllipsisTooltipText>{null}</EllipsisTooltipText>
  }
  return <EllipsisTooltipText empty="">{value}</EllipsisTooltipText>
}

function ProfileDescriptions({
  title,
  extra,
  column,
  items,
}: {
  title: ReactNode
  extra?: ReactNode
  column: DescriptionsProps['column']
  items: DescriptionItem[]
}) {
  return (
    <Descriptions
      className={styles.equalWidth}
      style={{ marginBottom: 16 }}
      layout="vertical"
      bordered
      size="small"
      title={title}
      extra={extra}
      column={column}
      items={items}
    />
  )
}

export function PartnerReadonlySections({ partner, extra }: PartnerReadonlySectionsProps) {
  return (
    <>
      <ProfileDescriptions
        title="基础信息"
        extra={extra}
        column={responsiveColumns}
        items={[
          { label: '合作伙伴名称', children: textValue(partner.name) },
          {
            label: '合作伙伴类型',
            children: textValue(catalogLabel(PARTNER_TYPE_LABELS, partner.partnerType)),
          },
          {
            label: '合作方向',
            children: textValue(catalogLabel(PARTNER_KIND_LABELS, partner.partnerKind)),
          },
          {
            label: '状态',
            children: textValue(
              DIRECTORY_PROFILE_STATUS_LABELS[partner.status] ?? partner.status,
            ),
          },
        ]}
      />

      <ProfileDescriptions
        title="联系人信息"
        column={responsiveColumns}
        items={[
          { label: '主联系人', children: textValue(partner.contactName ?? '-') },
          {
            label: '联系人角色',
            children: textValue(
              catalogLabel(PARTNER_CONTACT_ROLE_LABELS, partner.contactRole),
            ),
          },
          { label: '联系方式', children: textValue(partner.contactPhone ?? '-') },
        ]}
      />

      <ProfileDescriptions
        title="结算信息"
        column={responsiveColumns}
        items={[
          {
            label: '结算方式',
            children: textValue(
              catalogLabel(SETTLEMENT_METHOD_LABELS, partner.settlementMethod),
            ),
          },
          {
            label: '账期规则',
            children: textValue(
              catalogLabel(SETTLEMENT_CYCLE_LABELS, partner.paymentTermRule),
            ),
          },
          {
            label: '结算说明',
            children: textValue(partner.settlementNotes ?? '-'),
          },
        ]}
      />
    </>
  )
}
