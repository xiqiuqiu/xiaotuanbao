import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DirectoryProfileStatus, PartnerKind, PartnerType } from '@xiaotuanbao/shared'
import { ApiError } from '@/lib/request'
import { createPartner, listPartners } from '@/services/partner.service'
import {
  SOURCE_ORDER_PARTNER_QUICK_CREATE_DEFAULTS,
  createOrResolvePartnerByName,
  findPartnerByExactName,
  shouldShowPartnerQuickCreateOption,
} from './partner-quick-create'

vi.mock('@/services/partner.service', () => ({
  createPartner: vi.fn(),
  getPartner: vi.fn(),
  listPartners: vi.fn(),
}))

describe('partner-quick-create', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('defaults source-order create to 组团社 + 客户方', () => {
    expect(SOURCE_ORDER_PARTNER_QUICK_CREATE_DEFAULTS).toEqual({
      partnerType: PartnerType.GROUP_AGENCY,
      partnerKind: PartnerKind.GROUP_AGENT,
    })
  })

  it('shows create option only with write permission and no exact match', () => {
    expect(
      shouldShowPartnerQuickCreateOption({
        canWritePartner: true,
        searchText: '绿野旅行社',
        partners: [{ name: '其他' }],
      }),
    ).toBe(true)
    expect(
      shouldShowPartnerQuickCreateOption({
        canWritePartner: false,
        searchText: '绿野旅行社',
        partners: [],
      }),
    ).toBe(false)
    expect(
      findPartnerByExactName([{ id: '1', name: '绿野旅行社' }], ' 绿野旅行社 ')?.id,
    ).toBe('1')
  })

  it('createOrResolve creates with source-order defaults', async () => {
    vi.mocked(createPartner).mockResolvedValue({
      id: 'p-new',
      name: '绿野旅行社',
      partnerKind: PartnerKind.GROUP_AGENT,
      partnerType: PartnerType.GROUP_AGENCY,
      status: DirectoryProfileStatus.ACTIVE,
      contactName: null,
      contactRole: null,
      contactPhone: null,
      settlementMethod: null,
      paymentTermRule: null,
      settlementNotes: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    })

    const result = await createOrResolvePartnerByName({ name: '绿野旅行社' })

    expect(result.kind).toBe('created')
    expect(createPartner).toHaveBeenCalledWith(
      {
        name: '绿野旅行社',
        partnerType: PartnerType.GROUP_AGENCY,
        partnerKind: PartnerKind.GROUP_AGENT,
      },
      { silentError: true },
    )
  })

  it('createOrResolve returns existing on name conflict', async () => {
    vi.mocked(createPartner).mockRejectedValue(new ApiError('合作伙伴名称已存在', 409))
    vi.mocked(listPartners).mockResolvedValue({
      items: [
        {
          id: 'p-dup',
          name: '绿野旅行社',
          partnerKind: PartnerKind.GROUP_AGENT,
          partnerType: PartnerType.GROUP_AGENCY,
          status: DirectoryProfileStatus.ACTIVE,
          contactName: null,
          contactRole: null,
          contactPhone: null,
          settlementMethod: null,
          paymentTermRule: null,
          settlementNotes: null,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 100,
    })

    const result = await createOrResolvePartnerByName({ name: '绿野旅行社' })
    expect(result).toEqual({
      kind: 'existing',
      partner: expect.objectContaining({ id: 'p-dup' }),
    })
  })
})
