import { describe, expect, it } from 'vitest'
import { canEditSupplier } from './supplier-permission'

describe('canEditSupplier (ADR-0023)', () => {
  it('returns true when actionKeys include supplier:write (计调/企业管理员)', () => {
    expect(canEditSupplier(['supplier:write'])).toBe(true)
  })

  it('returns false when supplier:write is absent (财务只读)', () => {
    expect(canEditSupplier([])).toBe(false)
    expect(canEditSupplier(['departure:write', 'partner:write'])).toBe(false)
  })
})
