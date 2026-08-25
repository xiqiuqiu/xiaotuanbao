import { CAPABILITY_TARGET_DENY_CODES } from './agent-platform'
import { REGISTERED_CAPABILITY_DEFINITIONS } from './capability-catalog'

describe('登记 Capability 目标解析拒绝码', () => {
  it.each(REGISTERED_CAPABILITY_DEFINITIONS)(
    '$key@$version 登记目标解析器与稳定拒绝码',
    (definition) => {
      expect(definition.gateway?.targetKind).toEqual(expect.any(String))
      expect(definition.gateway?.denyCodes.length).toBeGreaterThan(0)
      for (const code of definition.gateway?.denyCodes ?? []) {
        expect(CAPABILITY_TARGET_DENY_CODES).toContain(code)
      }
    },
  )
})
