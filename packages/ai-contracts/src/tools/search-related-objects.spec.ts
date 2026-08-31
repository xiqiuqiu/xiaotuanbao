import {
  SEARCH_RELATED_OBJECTS_LIMIT,
  SEARCH_USERS_TOOL,
  SEARCH_SUPPLIERS_TOOL,
  SEARCH_PARTNERS_TOOL,
  searchUsersInputSchema,
  searchUsersModelInputSchema,
  searchUsersOutputSchema,
  searchSuppliersInputSchema,
  searchSuppliersModelInputSchema,
  searchSuppliersOutputSchema,
  searchPartnersInputSchema,
  searchPartnersModelInputSchema,
  searchPartnersOutputSchema,
} from './search-related-objects'
import { AI_CREATE_TOOL_NAMES, capabilitiesForPendingReview } from './review-package'

describe('search related objects contract v1 #443', () => {
  it('declares versioned search tools among AI create capabilities', () => {
    expect(SEARCH_USERS_TOOL).toEqual({ name: 'searchUsers', version: 1 })
    expect(SEARCH_SUPPLIERS_TOOL).toEqual({ name: 'searchSuppliers', version: 1 })
    expect(SEARCH_PARTNERS_TOOL).toEqual({ name: 'searchPartners', version: 1 })
    expect(AI_CREATE_TOOL_NAMES).toEqual([
      'getTaskContext',
      'searchRouteTemplates',
      'searchUsers',
      'searchSuppliers',
      'searchPartners',
      'proposeReviewPackage',
      'getMaterialParseResult',
      'readConversationHistory',
      'readConversationSource',
    ])
    expect(SEARCH_RELATED_OBJECTS_LIMIT).toBe(5)
  })

  it('keeps related-object search available while a review package is pending', () => {
    expect(capabilitiesForPendingReview(false)).toEqual([
      'getTaskContext',
      'searchRouteTemplates',
      'searchUsers',
      'searchSuppliers',
      'searchPartners',
      'proposeReviewPackage',
      'getMaterialParseResult',
      'readConversationHistory',
      'readConversationSource',
    ])
    expect(capabilitiesForPendingReview(true)).toEqual([
      'getTaskContext',
      'searchRouteTemplates',
      'searchUsers',
      'searchSuppliers',
      'searchPartners',
      'getMaterialParseResult',
      'readConversationHistory',
      'readConversationSource',
    ])
  })

  it('strips claimed organization, permission and object ids from model search input', () => {
    expect(
      searchUsersModelInputSchema.parse({
        keyword: '王杰',
        organizationId: 'org-forged',
        permissionKeys: ['departure:write'],
        id: 'user-forged',
        taskId: 'model-supplied',
      }),
    ).toEqual({ keyword: '王杰' })

    expect(
      searchSuppliersModelInputSchema.parse({
        keyword: '川西车队',
        category: 'transport',
        organizationId: 'org-forged',
        id: 'supplier-forged',
      }),
    ).toEqual({ keyword: '川西车队', category: 'transport' })

    expect(
      searchPartnersModelInputSchema.parse({
        keyword: '成都组团',
        organizationId: 'org-forged',
        partnerId: 'partner-forged',
      }),
    ).toEqual({ keyword: '成都组团' })
  })

  it('keeps task identity on the HTTP envelope and strips claimed organization', () => {
    expect(
      searchUsersInputSchema.parse({
        taskId: 'task-1',
        runId: 'run-1',
        keyword: '王杰',
        organizationId: 'org-forged',
        id: 'user-forged',
      }),
    ).toEqual({
      taskId: 'task-1',
      runId: 'run-1',
      keyword: '王杰',
    })
    expect(
      searchSuppliersInputSchema.parse({
        taskId: 'task-1',
        runId: 'run-1',
        keyword: '川西车队',
        category: 'transport',
        organizationId: 'org-forged',
      }),
    ).toEqual({
      taskId: 'task-1',
      runId: 'run-1',
      keyword: '川西车队',
      category: 'transport',
    })
    expect(
      searchPartnersInputSchema.parse({
        taskId: 'task-1',
        runId: 'run-1',
        keyword: '成都组团',
        organizationId: 'org-forged',
      }),
    ).toEqual({
      taskId: 'task-1',
      runId: 'run-1',
      keyword: '成都组团',
    })
  })

  it('returns at most five disambiguation items and never echoes organization or permissions', () => {
    const users = searchUsersOutputSchema.parse({
      items: [
        {
          kind: 'user',
          id: 'user-1',
          name: '王杰',
          status: 'enabled',
          matchReasons: [{ code: 'name_contains_token', token: '王杰' }],
        },
      ],
      organizationId: 'org-secret',
      permissionKeys: ['departure:write'],
    })
    expect(users).toEqual({
      items: [
        {
          kind: 'user',
          id: 'user-1',
          name: '王杰',
          status: 'enabled',
          matchReasons: [{ code: 'name_contains_token', token: '王杰' }],
        },
      ],
    })
    expect(users).not.toHaveProperty('organizationId')
    expect(users).not.toHaveProperty('permissionKeys')

    const suppliers = searchSuppliersOutputSchema.parse({
      items: [
        {
          kind: 'supplier',
          id: 'sup-1',
          name: '川西车队',
          status: 'enabled',
          categories: ['transport'],
          matchReasons: [{ code: 'name_contains_token', token: '川西' }],
        },
      ],
      organizationId: 'org-secret',
    })
    expect(suppliers.items[0]).toMatchObject({
      kind: 'supplier',
      categories: ['transport'],
    })
    expect(suppliers).not.toHaveProperty('organizationId')

    const partners = searchPartnersOutputSchema.parse({
      items: [
        {
          kind: 'partner',
          id: 'partner-1',
          name: '成都组团',
          status: 'enabled',
          partnerKind: 'group_agent',
          matchReasons: [{ code: 'name_contains_token', token: '成都' }],
        },
      ],
      contactPhone: '13800000000',
    })
    expect(partners.items[0]).toMatchObject({
      kind: 'partner',
      partnerKind: 'group_agent',
    })
    expect(partners).not.toHaveProperty('contactPhone')
  })

  it('rejects more than five items', () => {
    expect(() =>
      searchUsersOutputSchema.parse({
        items: Array.from({ length: 6 }, (_, index) => ({
          kind: 'user',
          id: `user-${index}`,
          name: `王杰${index}`,
          status: 'enabled',
          matchReasons: [{ code: 'name_contains_token', token: '王杰' }],
        })),
      }),
    ).toThrow()
  })
})
