import { describe, expect, it } from 'vitest'
import {
  agentTaskCompletedNavigation,
  agentTaskWorkspaceNavigation,
  isCurrentAgentTaskWorkspace,
} from './task-descriptor-navigation'

describe('task descriptor navigation #439', () => {
  it('builds the same workspace and completion routes the departure wizard already used', () => {
    expect(agentTaskWorkspaceNavigation('task-1')).toEqual({
      to: '/departure/new',
      search: { taskId: 'task-1' },
    })
    expect(agentTaskCompletedNavigation('dep-1')).toEqual({
      to: '/departure/$departureId',
      params: { departureId: 'dep-1' },
      search: { tab: 'overview' },
    })
  })

  it('detects when the current location is already the task workspace', () => {
    expect(isCurrentAgentTaskWorkspace('/departure/new', '?taskId=task-1', 'task-1')).toBe(true)
    expect(isCurrentAgentTaskWorkspace('/departure/new', '?taskId=other', 'task-1')).toBe(false)
    expect(isCurrentAgentTaskWorkspace('/partner/partner-1', '?taskId=task-1', 'task-1')).toBe(false)
  })
})
