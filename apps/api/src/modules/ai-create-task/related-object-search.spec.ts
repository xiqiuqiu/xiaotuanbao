import {
  searchPartnersForAgent,
  searchSuppliersForAgent,
  searchUsersForAgent,
} from './related-object-search'

describe('related object search matcher #443', () => {
  const users = [
    { id: 'user-enabled', name: '王杰', status: 'enabled' as const },
    { id: 'user-disabled', name: '王杰停用', status: 'disabled' as const },
    { id: 'user-other', name: '李明', status: 'enabled' as const },
    { id: 'user-same-a', name: '王杰计调', status: 'enabled' as const },
    { id: 'user-same-b', name: '王杰财务', status: 'enabled' as const },
  ]

  const suppliers = [
    {
      id: 'sup-driver',
      name: '川西车队',
      status: 'enabled' as const,
      categories: ['transport'],
    },
    {
      id: 'sup-guide',
      name: '川西导游社',
      status: 'enabled' as const,
      categories: ['guide'],
    },
    {
      id: 'sup-disabled',
      name: '川西停用车队',
      status: 'disabled' as const,
      categories: ['transport'],
    },
    {
      id: 'sup-hotel',
      name: '川西酒店',
      status: 'enabled' as const,
      categories: ['hotel'],
    },
  ]

  const partners = [
    {
      id: 'partner-enabled',
      name: '成都组团',
      status: 'enabled' as const,
      partnerKind: 'group_agent',
    },
    {
      id: 'partner-disabled',
      name: '成都组团停用',
      status: 'disabled' as const,
      partnerKind: 'group_agent',
    },
    {
      id: 'partner-same-a',
      name: '成都组团甲',
      status: 'enabled' as const,
      partnerKind: 'peer',
    },
    {
      id: 'partner-same-b',
      name: '成都组团乙',
      status: 'enabled' as const,
      partnerKind: 'peer',
    },
  ]

  it('returns empty when keyword is blank', () => {
    const emptyResult = { items: [], total: 0, hasMore: false }
    expect(searchUsersForAgent(users, {})).toEqual(emptyResult)
    expect(searchUsersForAgent(users, { keyword: '   ' })).toEqual(emptyResult)
    expect(searchSuppliersForAgent(suppliers, { category: 'transport' })).toEqual(emptyResult)
    expect(searchPartnersForAgent(partners, { keyword: '' })).toEqual(emptyResult)
  })

  it('filters disabled users and returns multiple same-name matches without picking one', () => {
    const { items } = searchUsersForAgent(users, { keyword: '王杰' })
    expect(items.map((item) => item.id)).toEqual(['user-enabled', 'user-same-b', 'user-same-a'])
    expect(items.every((item) => item.status === 'enabled')).toBe(true)
    expect(items.some((item) => item.id === 'user-disabled')).toBe(false)
  })

  it('filters suppliers by enabled status and required category', () => {
    const { items: drivers } = searchSuppliersForAgent(suppliers, {
      keyword: '川西',
      category: 'transport',
    })
    expect(drivers.map((item) => item.id)).toEqual(['sup-driver'])
    expect(drivers[0]?.categories).toEqual(['transport'])

    const { items: allNamed } = searchSuppliersForAgent(suppliers, { keyword: '川西' })
    expect(allNamed.map((item) => item.id).sort()).toEqual(['sup-driver', 'sup-guide', 'sup-hotel'])
    expect(allNamed.some((item) => item.id === 'sup-disabled')).toBe(false)
  })

  it('filters disabled partners and keeps disambiguation candidates', () => {
    const { items } = searchPartnersForAgent(partners, { keyword: '成都组团' })
    expect(items.map((item) => item.id)).toEqual([
      'partner-enabled',
      'partner-same-a',
      'partner-same-b',
    ])
    expect(items.some((item) => item.id === 'partner-disabled')).toBe(false)
  })

  it('returns truncation metadata when more than five matching users exist', () => {
    const matches = Array.from({ length: 6 }, (_, index) => ({
      id: `user-${index + 1}`,
      name: `同名用户 ${index + 1}`,
      status: 'enabled' as const,
    }))

    expect(searchUsersForAgent(matches, { keyword: '同名用户' })).toMatchObject({
      total: 6,
      hasMore: true,
    })
  })
})
