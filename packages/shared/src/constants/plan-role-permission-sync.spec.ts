import { planRolePermissionSync } from './plan-role-permission-sync'

describe('planRolePermissionSync', () => {
  it('adds missing keys and removes extras (bidirectional)', () => {
    expect(
      planRolePermissionSync(
        ['/', '/departure', '/partner'],
        ['/', '/departure', '/finance/receivable', '/supplier'],
      ),
    ).toEqual({
      toAdd: ['/finance/receivable', '/supplier'],
      toRemove: ['/partner'],
    })
  })

  it('returns empty diffs when current already matches desired', () => {
    expect(planRolePermissionSync(['/', '/departure'], ['/', '/departure'])).toEqual({
      toAdd: [],
      toRemove: [],
    })
  })
})
