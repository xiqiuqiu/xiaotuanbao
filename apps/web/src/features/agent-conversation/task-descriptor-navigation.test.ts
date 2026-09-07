import { describe, expect, it } from 'vitest'
import {
  agentTaskCompletedNavigation,
  agentTaskWorkspaceNavigation,
  departureIdFromPathname,
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

  it('does not send unregistered task types to the departure wizard', () => {
    expect(() => agentTaskWorkspaceNavigation('task-1', 'unknown.task')).toThrow('未登记')
    expect(() => agentTaskCompletedNavigation('dep-1', 'unknown.task')).toThrow('未登记')
    expect(
      isCurrentAgentTaskWorkspace('/departure/new', '?taskId=task-1', 'task-1', 'unknown.task'),
    ).toBe(false)
  })

  it('treats the current departure detail as the collaboration workspace #449', () => {
    expect(agentTaskWorkspaceNavigation('task-1', 'departure_collaboration', { departureId: 'dep-1' })).toEqual({
      to: '/departure/$departureId',
      params: { departureId: 'dep-1' },
    })
    expect(
      isCurrentAgentTaskWorkspace(
        '/departure/dep-1',
        '',
        'task-1',
        'departure_collaboration',
        { departureId: 'dep-1' },
      ),
    ).toBe(true)
    expect(
      isCurrentAgentTaskWorkspace(
        '/departure/dep-2',
        '',
        'task-1',
        'departure_collaboration',
        { departureId: 'dep-1' },
      ),
    ).toBe(false)
    expect(isCurrentAgentTaskWorkspace('/departure/new', '?taskId=task-1', 'task-1', 'departure_collaboration')).toBe(
      false,
    )
  })
})

describe('departureIdFromPathname #449', () => {
  it('reads the departure detail id and ignores the create workspace', () => {
    expect(departureIdFromPathname('/departure/dep-1')).toBe('dep-1')
    expect(departureIdFromPathname('/departure/new')).toBeUndefined()
    expect(departureIdFromPathname('/partner/partner-1')).toBeUndefined()
  })
})
