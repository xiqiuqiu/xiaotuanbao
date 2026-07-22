import { describe, expect, it } from 'vitest'
import { canEditProduct } from './product-permission'

describe('canEditProduct', () => {
  it('allows when product:write is granted', () => {
    expect(canEditProduct(['product:write'])).toBe(true)
  })

  it('denies when product:write is missing', () => {
    expect(canEditProduct(['supplier:write'])).toBe(false)
  })
})
