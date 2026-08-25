import { afterEach, describe, expect, it } from 'vitest'
import {
  AGENT_RETURN_LOCATION_STORAGE_KEY,
  agentConversationPath,
  captureReturnLocation,
  fallbackReturnLocation,
  isAgentConversationPath,
  isUsableReturnPath,
  parseStoredReturnLocation,
  persistReturnLocation,
  readPersistedReturnLocation,
  toReturnHref,
  toReturnNavigateOptions,
} from './agent-conversation-location'

describe('agent conversation location', () => {
  afterEach(() => {
    sessionStorage.clear()
  })

  it('treats side and global conversation routes as the same Agent path family', () => {
    expect(isAgentConversationPath('/agent/conversations')).toBe(true)
    expect(isAgentConversationPath('/agent/conversations/new')).toBe(true)
    expect(isAgentConversationPath('/agent/conversations/c-1')).toBe(true)
    expect(isAgentConversationPath('/departure')).toBe(false)
  })

  it('builds the global path from the current Conversation ID without creating a new one', () => {
    expect(agentConversationPath('c-1')).toBe('/agent/conversations/c-1')
    expect(agentConversationPath(null)).toBe('/agent/conversations/new')
  })

  it('captures the full business return location including search and hash', () => {
    expect(
      captureReturnLocation({
        pathname: '/departure/d-1',
        searchStr: '?tab=sourceOrders',
        hash: '#roster',
      }),
    ).toEqual({
      pathname: '/departure/d-1',
      search: '?tab=sourceOrders',
      hash: '#roster',
    })
    expect(toReturnHref(captureReturnLocation({ pathname: '/partner', search: 'direction=in' })!)).toBe(
      '/partner?direction=in',
    )
    expect(
      toReturnNavigateOptions({
        pathname: '/departure/d-1',
        search: '?tab=sourceOrders',
        hash: '#roster',
      }),
    ).toEqual({
      to: '/departure/d-1',
      search: { tab: 'sourceOrders' },
      hash: 'roster',
    })
  })

  it('rejects login, platform and Agent routes as return locations', () => {
    expect(isUsableReturnPath('/login')).toBe(false)
    expect(isUsableReturnPath('/platform/organizations')).toBe(false)
    expect(isUsableReturnPath('/agent/conversations/c-1')).toBe(false)
    expect(captureReturnLocation({ pathname: '/agent/conversations/c-1' })).toBeNull()
    expect(fallbackReturnLocation()).toEqual({ pathname: '/', search: '', hash: '' })
  })

  it('round-trips a persisted return location in sessionStorage', () => {
    persistReturnLocation({ pathname: '/finance/receivable', search: '?status=open', hash: '' })
    expect(sessionStorage.getItem(AGENT_RETURN_LOCATION_STORAGE_KEY)).toContain('/finance/receivable')
    expect(readPersistedReturnLocation()).toEqual({
      pathname: '/finance/receivable',
      search: '?status=open',
      hash: '',
    })
    expect(parseStoredReturnLocation('{"pathname":"/agent/conversations/c-1"}')).toBeNull()
    persistReturnLocation(null)
    expect(readPersistedReturnLocation()).toBeNull()
  })
})
