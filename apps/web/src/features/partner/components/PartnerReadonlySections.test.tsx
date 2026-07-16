import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  DirectoryProfileStatus,
  PartnerContactRole,
  PartnerKind,
  PartnerType,
} from '@xiaotuanbao/shared'
import type { PartnerSummary } from '@/types/api'
import { PartnerReadonlySections } from './PartnerReadonlySections'

const mockPartner: PartnerSummary = {
  id: 'partner-1',
  name: '华东国旅',
  partnerKind: PartnerKind.GROUP_AGENT,
  partnerType: PartnerType.GROUP_AGENCY,
  status: DirectoryProfileStatus.ACTIVE,
  contactName: '王经理',
  contactRole: PartnerContactRole.OPERATOR,
  contactPhone: '13800138000',
  settlementMethod: null,
  paymentTermRule: null,
  settlementNotes: '月结 30 天',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('PartnerReadonlySections', () => {
  it('renders profile sections aligned with edit drawer fields', () => {
    render(<PartnerReadonlySections partner={mockPartner} />)

    expect(screen.getByText('基础信息')).toBeInTheDocument()
    expect(screen.getByText('联系人信息')).toBeInTheDocument()
    expect(screen.getByText('结算信息')).toBeInTheDocument()
    expect(screen.getByText('华东国旅')).toBeInTheDocument()
    expect(screen.getByText('组团社')).toBeInTheDocument()
    expect(screen.getByText('客户方')).toBeInTheDocument()
    expect(screen.getByText('王经理')).toBeInTheDocument()
    expect(screen.getByText('计调')).toBeInTheDocument()
    expect(screen.getByText('月结 30 天')).toBeInTheDocument()
  })

  it('applies equal-width layout class to profile descriptions', () => {
    const { container } = render(<PartnerReadonlySections partner={mockPartner} />)
    const descriptions = container.querySelectorAll('.ant-descriptions')
    expect(descriptions.length).toBe(3)
    for (const node of descriptions) {
      expect(node.className).toMatch(/equalWidth/)
    }
  })
})
