import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DirectoryProfileStatus, ResourceKind } from '@xiaotuanbao/shared'
import { ApiError } from '@/lib/request'
import { createSupplier, getSupplier, listSuppliers } from '@/services/supplier.service'
import {
  createOrResolveSupplierByName,
  findSupplierByExactName,
  formatSupplierQuickCreateOptionLabel,
  resolveDuplicateSupplierSelection,
  shouldShowSupplierQuickCreateOption,
} from './supplier-quick-create'

vi.mock('@/services/supplier.service', () => ({
  createSupplier: vi.fn(),
  getSupplier: vi.fn(),
  listSuppliers: vi.fn(),
}))

describe('supplier-quick-create', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('formats create option label', () => {
    expect(formatSupplierQuickCreateOptionLabel('  千岛湖票务  ')).toBe('创建“千岛湖票务”')
  })

  it('finds exact trimmed name', () => {
    expect(
      findSupplierByExactName([{ id: '1', name: '千岛湖票务' }], '  千岛湖票务  ')?.id,
    ).toBe('1')
    expect(findSupplierByExactName([{ id: '1', name: '千岛湖票务' }], '千岛湖')).toBeUndefined()
  })

  it('shows create option only with write permission, category ready, and no exact match', () => {
    expect(
      shouldShowSupplierQuickCreateOption({
        canWriteSupplier: true,
        categoryReady: true,
        searchText: '新车队',
        suppliers: [{ name: '其他' }],
      }),
    ).toBe(true)

    expect(
      shouldShowSupplierQuickCreateOption({
        canWriteSupplier: false,
        categoryReady: true,
        searchText: '新车队',
        suppliers: [],
      }),
    ).toBe(false)

    expect(
      shouldShowSupplierQuickCreateOption({
        canWriteSupplier: true,
        categoryReady: false,
        searchText: '新车队',
        suppliers: [],
      }),
    ).toBe(false)
  })

  it('resolves duplicate selection by active status and category', () => {
    expect(
      resolveDuplicateSupplierSelection({
        supplier: {
          id: 's1',
          name: '车队',
          categories: ['transport'],
          status: DirectoryProfileStatus.ACTIVE,
        },
        resourceKind: ResourceKind.TRANSPORT,
      }),
    ).toEqual({ ok: true, supplierId: 's1' })

    expect(
      resolveDuplicateSupplierSelection({
        supplier: {
          id: 's1',
          name: '车队',
          categories: ['guide'],
          status: DirectoryProfileStatus.ACTIVE,
        },
        resourceKind: ResourceKind.TRANSPORT,
      }),
    ).toEqual({ ok: false, reason: 'missing_category' })
  })

  it('createOrResolve creates when name is free', async () => {
    vi.mocked(createSupplier).mockResolvedValue({
      id: 'new',
      name: '新车队',
      categories: ['transport'],
      status: DirectoryProfileStatus.ACTIVE,
      contactName: null,
      contactPhone: null,
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
      businessNotes: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    })

    const result = await createOrResolveSupplierByName({
      name: '新车队',
      category: ResourceKind.TRANSPORT,
    })

    expect(result.kind).toBe('created')
    expect(createSupplier).toHaveBeenCalledWith(
      { name: '新车队', categories: [ResourceKind.TRANSPORT] },
      { silentError: true },
    )
  })

  it('createOrResolve returns existing on name conflict', async () => {
    vi.mocked(createSupplier).mockRejectedValue(new ApiError('供应商名称已存在', 409))
    vi.mocked(listSuppliers).mockResolvedValue({
      items: [
        {
          id: 'dup',
          name: '同名车队',
          categories: ['transport'],
          status: DirectoryProfileStatus.ACTIVE,
          contactName: null,
          contactPhone: null,
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
          businessNotes: null,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 100,
    })

    const result = await createOrResolveSupplierByName({
      name: '同名车队',
      category: ResourceKind.TRANSPORT,
    })

    expect(result).toEqual({
      kind: 'existing',
      supplier: expect.objectContaining({ id: 'dup', name: '同名车队' }),
    })
    expect(getSupplier).not.toHaveBeenCalled()
  })
})
