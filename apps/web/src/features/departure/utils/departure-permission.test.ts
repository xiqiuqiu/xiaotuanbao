import { describe, expect, it } from 'vitest'
import { canEditDeparture } from './departure-permission'

describe('canEditDeparture (ADR-0023)', () => {
  it('returns true when actionKeys include departure:write (计调/企业管理员)', () => {
    expect(canEditDeparture(['departure:write'])).toBe(true)
  })

  it('returns false when departure:write is absent (财务只读)', () => {
    expect(canEditDeparture([])).toBe(false)
    expect(canEditDeparture(['partner:write', 'supplier:write'])).toBe(false)
  })
})
