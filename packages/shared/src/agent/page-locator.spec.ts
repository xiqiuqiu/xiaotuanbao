import {
  PAGE_LOCATOR_UNSUPPORTED,
  parsePageLocator,
  parsePageLocatorFromLocation,
} from './page-locator'

describe('page locator schema #371', () => {
  it('accepts a whitelisted partner page locator and drops extra client claims', () => {
    expect(
      parsePageLocator({
        kind: 'partner',
        objectId: 'partner-1',
        section: 'accounts',
        permissionKeys: ['/partner'],
        html: '<div />',
        screenshot: 'data:image/png;base64,abc',
      }),
    ).toEqual({
      kind: 'partner',
      objectId: 'partner-1',
      section: 'accounts',
    })
  })

  it('accepts a departure detail locator without a section', () => {
    expect(
      parsePageLocator({
        kind: 'departure',
        objectId: 'departure-1',
      }),
    ).toEqual({
      kind: 'departure',
      objectId: 'departure-1',
    })
  })

  it('rejects unknown kinds, empty ids and unsupported client snapshots', () => {
    expect(parsePageLocator({ kind: 'invoice', objectId: 'inv-1' })).toBeNull()
    expect(parsePageLocator({ kind: 'partner', objectId: '  ' })).toBeNull()
    expect(parsePageLocator({ kind: 'partner' })).toBeNull()
    expect(parsePageLocator({ kind: 'partner', objectId: 'partner-1', section: 'hack' })).toBeNull()
    expect(parsePageLocator(null)).toBeNull()
    expect(parsePageLocator({ html: '<main />' })).toBeNull()
  })

  it('parses supported business routes and ignores lists, create pages and Agent routes', () => {
    expect(parsePageLocatorFromLocation('/partner/partner-1', '?tab=accounts&other=1')).toEqual({
      kind: 'partner',
      objectId: 'partner-1',
      section: 'accounts',
    })
    expect(parsePageLocatorFromLocation('/departure/departure-1', '?tab=overview')).toEqual({
      kind: 'departure',
      objectId: 'departure-1',
      section: 'overview',
    })
    expect(parsePageLocatorFromLocation('/partner')).toBeNull()
    expect(parsePageLocatorFromLocation('/departure/new')).toBeNull()
    expect(parsePageLocatorFromLocation('/agent/conversations/c-1')).toBeNull()
    expect(parsePageLocatorFromLocation('/finance/receivable')).toBeNull()
  })

  it('exposes a stable unsupported-page reason for callers', () => {
    expect(PAGE_LOCATOR_UNSUPPORTED).toBe('PAGE_LOCATOR_UNSUPPORTED')
  })
})
