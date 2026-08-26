import { assertAgentResetEnvironment } from '../../../scripts/reset-agent-run-data'

describe('assertAgentResetEnvironment', () => {
  it('blocks production', () => {
    expect(() => assertAgentResetEnvironment('production')).toThrow(
      '拒绝在 production 重置 Agent 运行数据',
    )
  })

  it('allows development', () => {
    expect(() => assertAgentResetEnvironment('development')).not.toThrow()
  })
})
