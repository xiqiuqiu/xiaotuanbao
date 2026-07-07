import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SupplierCategory, DirectoryProfileStatus } from '@xiaotuanbao/shared'
import type { SupplierSummary } from '@/types/api'
import { SupplierReadonlySections } from './SupplierReadonlySections'

const mockSupplier: SupplierSummary = {
  id: 'sup-1',
  name: '西湖国宾馆',
  category: SupplierCategory.HOTEL,
  status: DirectoryProfileStatus.ACTIVE,
  contactName: '张经理',
  contactPhone: '13800138000',
  settlementMethod: null,
  settlementCycle: null,
  settlementNotes: null,
  referenceQuoteNotes: null,
  invoiceAvailable: null,
  invoiceType: null,
  taxRate: null,
  accountName: null,
  bankName: null,
  bankAccount: null,
  businessNotes: '最大接待 200 人',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('SupplierReadonlySections', () => {
  it('renders profile sections aligned with edit drawer fields', () => {
    render(<SupplierReadonlySections supplier={mockSupplier} />)

    expect(screen.getByText('基础信息')).toBeInTheDocument()
    expect(screen.getByText('联系信息')).toBeInTheDocument()
    expect(screen.getByText('结算信息')).toBeInTheDocument()
    expect(screen.getByText('更多财务信息')).toBeInTheDocument()
    expect(screen.getByText('收款账户信息')).toBeInTheDocument()
    expect(screen.getAllByText('备注').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('西湖国宾馆')).toBeInTheDocument()
    expect(screen.getByText('酒店')).toBeInTheDocument()
    expect(screen.getByText('张经理')).toBeInTheDocument()
    expect(screen.getByText('最大接待 200 人')).toBeInTheDocument()
  })
})
