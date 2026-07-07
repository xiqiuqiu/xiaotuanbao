import { Form, Input, Select } from 'antd'
import type { ReactNode } from 'react'
import type {
  PartnerContactRole,
  PartnerKind,
  PartnerType,
  SettlementCycle,
  SettlementMethod,
} from '@xiaotuanbao/shared'
import {
  SETTLEMENT_CYCLE_OPTIONS,
  SETTLEMENT_METHOD_OPTIONS,
} from '@/features/directory/catalog'
import {
  PARTNER_CONTACT_ROLE_OPTIONS,
  PARTNER_KIND_OPTIONS,
  PARTNER_TYPE_OPTIONS,
} from '../catalog'

export interface PartnerFormValues {
  name: string
  partnerKind: PartnerKind
  partnerType: PartnerType
  contactName?: string
  contactRole?: PartnerContactRole
  contactPhone?: string
  settlementMethod?: SettlementMethod
  paymentTermRule?: SettlementCycle
  settlementNotes?: string
}

export function PartnerProfileSections() {
  return (
    <>
      <TypographySection title="基础信息">
        <Form.Item
          label="合作伙伴名称"
          name="name"
          rules={[{ required: true, message: '请输入合作伙伴名称' }]}
        >
          <Input placeholder="例如：华东国旅" />
        </Form.Item>
        <Form.Item
          label="合作伙伴类型"
          name="partnerType"
          rules={[{ required: true, message: '请选择合作伙伴类型' }]}
        >
          <Select options={[...PARTNER_TYPE_OPTIONS]} placeholder="请选择类型" />
        </Form.Item>
        <Form.Item
          label="合作方向"
          name="partnerKind"
          rules={[{ required: true, message: '请选择合作方向' }]}
        >
          <Select options={[...PARTNER_KIND_OPTIONS]} placeholder="请选择合作方向" />
        </Form.Item>
      </TypographySection>

      <TypographySection title="联系人信息">
        <Form.Item label="主联系人" name="contactName">
          <Input placeholder="例如：王经理" />
        </Form.Item>
        <Form.Item label="联系人角色" name="contactRole">
          <Select allowClear options={[...PARTNER_CONTACT_ROLE_OPTIONS]} placeholder="可选" />
        </Form.Item>
        <Form.Item label="联系方式" name="contactPhone">
          <Input placeholder="例如：13800138000" />
        </Form.Item>
      </TypographySection>

      <TypographySection title="结算信息">
        <Form.Item label="结算方式" name="settlementMethod">
          <Select allowClear options={[...SETTLEMENT_METHOD_OPTIONS]} placeholder="可选" />
        </Form.Item>
        <Form.Item label="账期规则" name="paymentTermRule">
          <Select allowClear options={[...SETTLEMENT_CYCLE_OPTIONS]} placeholder="可选" />
        </Form.Item>
        <Form.Item label="结算说明" name="settlementNotes">
          <Input.TextArea rows={2} placeholder="例如：出团后 7 个工作日结" />
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
