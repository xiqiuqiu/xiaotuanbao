import { describe, expect, it } from 'vitest'
import { findMenuKeyForPathname, isMenuPathAllowed } from './menu-permission'

describe('isMenuPathAllowed', () => {
  const menuKeys = ['/', '/supplier', '/system/users']

  it('allows exact menu path', () => {
    expect(isMenuPathAllowed('/supplier', menuKeys)).toBe(true)
  })

  it('allows supplier detail sub-route when /supplier is granted', () => {
    expect(isMenuPathAllowed('/supplier/clxyz123', menuKeys)).toBe(true)
  })

  it('allows partner detail sub-route when /partner is granted', () => {
    expect(isMenuPathAllowed('/partner/clxyz123', ['/', '/partner'])).toBe(true)
  })

  it('denies unrelated paths', () => {
    expect(isMenuPathAllowed('/partner', menuKeys)).toBe(false)
  })

  it('denies sub-route when parent menu key is missing', () => {
    expect(isMenuPathAllowed('/partner/abc', menuKeys)).toBe(false)
  })
})

describe('findMenuKeyForPathname', () => {
  it('returns the parent menu key for a child route', () => {
    expect(findMenuKeyForPathname('/partner/abc', ['/', '/partner'])).toBe('/partner')
  })

  it('prefers the most specific matching menu key', () => {
    expect(
      findMenuKeyForPathname('/finance/receivable/detail', [
        '/finance',
        '/finance/receivable',
      ]),
    ).toBe('/finance/receivable')
  })
})
