import { describe, expect, it } from 'vitest'
import { PRESET_ROLE_ACTION_KEYS, PRESET_ROLE_NAMES } from '@xiaotuanbao/shared'
import { canEditProduct } from './product-permission'

describe('canEditProduct', () => {
  it('allows 计调 and 企业管理员, denies 财务', () => {
    expect(canEditProduct([...PRESET_ROLE_ACTION_KEYS[PRESET_ROLE_NAMES.COORDINATOR]])).toBe(
      true,
    )
    expect(canEditProduct([...PRESET_ROLE_ACTION_KEYS[PRESET_ROLE_NAMES.ORG_ADMIN]])).toBe(true)
    expect(canEditProduct([...PRESET_ROLE_ACTION_KEYS[PRESET_ROLE_NAMES.FINANCE]])).toBe(false)
  })
})
