import { describe, expect, it } from 'vitest'
import { canEditPartner } from './partner-permission'

describe('canEditPartner (ADR-0023)', () => {
  it('returns true when actionKeys include partner:write (计调/企业管理员)', () => {
    expect(canEditPartner(['partner:write'])).toBe(true)
  })

  it('returns false when partner:write is absent (财务只读)', () => {
    expect(canEditPartner([])).toBe(false)
    expect(canEditPartner(['departure:write', 'supplier:write'])).toBe(false)
  })
})
