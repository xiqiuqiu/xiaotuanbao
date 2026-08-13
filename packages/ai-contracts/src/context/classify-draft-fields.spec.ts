import { classifyDraftFields } from './classify-draft-fields'
import type { AiCreateDraftSnapshot } from './classify-draft-fields'

function snapshot(overrides: Partial<AiCreateDraftSnapshot> = {}): AiCreateDraftSnapshot {
  return {
    mode: 'manual',
    routeName: '川西线',
    templateId: null,
    copyFromDepartureId: null,
    name: '八月川西团',
    startDate: '2026-09-01',
    endDate: '2026-09-05',
    ownerUserId: 'user-owner',
    departureType: 'combined',
    expectedGuestCountHint: 12,
    notes: '已沟通',
    driverSupplierId: null,
    guideSupplierId: null,
    vehiclePlate: null,
    contactPhone: null,
    ...overrides,
  }
}

describe('classifyDraftFields', () => {
  it('treats required basic-info values as filled and does not list them as missing', () => {
    const coverage = classifyDraftFields(snapshot())

    expect(coverage.filled).toEqual([
      'name',
      'routeName',
      'startDate',
      'endDate',
      'ownerUserId',
      'departureType',
    ])
    expect(coverage.missing).toEqual([])
    expect(coverage.optionalPresent).toEqual(['expectedGuestCountHint', 'notes'])
  })

  it('lists blank required fields as missing so the agent can ask only those', () => {
    const coverage = classifyDraftFields(
      snapshot({
        name: null,
        startDate: '  ',
        endDate: null,
        ownerUserId: null,
        expectedGuestCountHint: null,
        notes: null,
      }),
    )

    expect(coverage.filled).toEqual(['routeName', 'departureType'])
    expect(coverage.missing).toEqual(['name', 'startDate', 'endDate', 'ownerUserId'])
    expect(coverage.optionalPresent).toEqual([])
  })

  it('counts a template or copy source as a filled route even without routeName', () => {
    expect(
      classifyDraftFields(
        snapshot({
          mode: 'template',
          routeName: '',
          templateId: 'tpl-1',
        }),
      ).filled,
    ).toContain('routeName')

    expect(
      classifyDraftFields(
        snapshot({
          mode: 'copy',
          routeName: '',
          copyFromDepartureId: 'dep-1',
        }),
      ).missing,
    ).not.toContain('routeName')
  })
})
