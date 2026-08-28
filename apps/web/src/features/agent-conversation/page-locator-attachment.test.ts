import { describe, expect, it } from 'vitest'
import {
  conversationSendContextFromAttachment,
  currentPageAttachmentFromLocation,
  currentPageAttachmentLabel,
  nextPageAttachment,
} from './page-locator-attachment'

describe('current page attachment #371 #411', () => {
  it('has no attachment on workbench, list, and unsaved departure-creation pages', () => {
    expect(currentPageAttachmentFromLocation('/', '')).toBeNull()
    expect(currentPageAttachmentFromLocation('/partner', '')).toBeNull()
    expect(currentPageAttachmentFromLocation('/departure', '')).toBeNull()
    expect(currentPageAttachmentFromLocation('/departure/new', '')).toBeNull()
  })

  it('derives an object locator on supported detail pages', () => {
    expect(
      currentPageAttachmentFromLocation('/partner/partner-1', '?tab=accounts'),
    ).toEqual({
      kind: 'page_locator',
      locator: { kind: 'partner', objectId: 'partner-1', section: 'accounts' },
    })
    expect(
      currentPageAttachmentFromLocation('/departure/departure-1', '?tab=overview'),
    ).toEqual({
      kind: 'page_locator',
      locator: { kind: 'departure', objectId: 'departure-1', section: 'overview' },
    })
  })

  it('derives one task attachment when the departure wizard has a persisted task', () => {
    expect(
      currentPageAttachmentFromLocation('/departure/new', '?taskId=task-1'),
    ).toEqual({ kind: 'agent_task', taskType: 'departure_creation', taskId: 'task-1' })
  })

  it('does not auto-attach when switching to a historical conversation', () => {
    expect(
      nextPageAttachment({
        view: 'history',
        currentAttachment: {
          kind: 'page_locator',
          locator: { kind: 'partner', objectId: 'partner-1' },
        },
        captured: false,
      }),
    ).toBeNull()
  })

  it('attaches only after the user explicitly captures the current page', () => {
    const currentAttachment = {
      kind: 'agent_task' as const,
      taskType: 'departure_creation',
      taskId: 'task-1',
    }
    expect(
      nextPageAttachment({
        view: 'history',
        currentAttachment,
        captured: true,
      }),
    ).toEqual(currentAttachment)
  })

  it('reads attachment label and send context from the Task Descriptor', () => {
    const taskAttachment = currentPageAttachmentFromLocation('/departure/new', '?taskId=task-1')
    expect(taskAttachment && currentPageAttachmentLabel(taskAttachment)).toBe('当前建团工作')
    expect(conversationSendContextFromAttachment(taskAttachment)).toEqual({
      primaryTaskId: 'task-1',
    })
  })
})
