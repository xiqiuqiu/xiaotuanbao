import { beforeEach, describe, expect, it } from 'vitest'
import { clearLegacyAuthStorage } from './migration'

describe('clearLegacyAuthStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('只删除旧认证数据并保留记住账号与业务数据', () => {
    localStorage.setItem('xiaotuanbao-auth', 'legacy-token-payload')
    localStorage.setItem('xiaotuanbao.login.rememberedUsername', 'employee')
    localStorage.setItem('xiaotuanbao-business-filter', 'active')

    clearLegacyAuthStorage()

    expect(localStorage.getItem('xiaotuanbao-auth')).toBeNull()
    expect(localStorage.getItem('xiaotuanbao.login.rememberedUsername')).toBe('employee')
    expect(localStorage.getItem('xiaotuanbao-business-filter')).toBe('active')
  })
})
