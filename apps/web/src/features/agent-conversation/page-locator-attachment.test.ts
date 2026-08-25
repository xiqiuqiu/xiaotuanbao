import { afterEach, describe, expect, it } from 'vitest'
import { parsePageLocatorFromLocation } from '@xiaotuanbao/shared'
import { useAgentConversationStore } from './agent-conversation.store'
import { nextPageLocatorAttachment } from './page-locator-attachment'

describe('page locator attachment #371', () => {
  afterEach(() => {
    useAgentConversationStore.setState({
      view: 'page',
      conversationId: null,
      title: '新会话',
    })
  })

  it('attaches a removable locator when a new conversation starts on a supported page', () => {
    useAgentConversationStore.getState().startNewConversation()
    const locator = parsePageLocatorFromLocation('/partner/partner-1', '?tab=accounts')
    expect(
      nextPageLocatorAttachment({
        view: 'new',
        conversationId: null,
        currentLocator: locator,
        attachedLocator: null,
        captured: false,
      }),
    ).toEqual(locator)
  })

  it('does not auto-attach when switching to a historical conversation', () => {
    useAgentConversationStore.getState().selectConversation({
      id: 'c-1',
      title: '历史会话',
    })
    expect(
      nextPageLocatorAttachment({
        view: 'history',
        conversationId: 'c-1',
        currentLocator: parsePageLocatorFromLocation('/partner/partner-1'),
        attachedLocator: parsePageLocatorFromLocation('/partner/partner-1'),
        captured: false,
      }),
    ).toBeNull()
  })

  it('attaches only after the user explicitly captures the current page', () => {
    expect(
      nextPageLocatorAttachment({
        view: 'history',
        conversationId: 'c-1',
        currentLocator: parsePageLocatorFromLocation('/departure/departure-1', '?tab=overview'),
        attachedLocator: null,
        captured: true,
      }),
    ).toEqual({
      kind: 'departure',
      objectId: 'departure-1',
      section: 'overview',
    })
  })
})
