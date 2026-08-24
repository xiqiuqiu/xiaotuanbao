import { AgentTaskStatus } from '@prisma/client'
import { isOpenAgentTaskStatus } from './agent-task.runtime'

describe('isOpenAgentTaskStatus', () => {
  it('allows progress projection only while the task is still open', () => {
    expect(isOpenAgentTaskStatus(AgentTaskStatus.proposed)).toBe(true)
    expect(isOpenAgentTaskStatus(AgentTaskStatus.active)).toBe(true)
    expect(isOpenAgentTaskStatus(AgentTaskStatus.waiting)).toBe(true)
    expect(isOpenAgentTaskStatus(AgentTaskStatus.completed)).toBe(false)
    expect(isOpenAgentTaskStatus(AgentTaskStatus.failed)).toBe(false)
    expect(isOpenAgentTaskStatus(AgentTaskStatus.cancelled)).toBe(false)
    expect(isOpenAgentTaskStatus(AgentTaskStatus.closed)).toBe(false)
    expect(isOpenAgentTaskStatus(undefined)).toBe(false)
  })
})
