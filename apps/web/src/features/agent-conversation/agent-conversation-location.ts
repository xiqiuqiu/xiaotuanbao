export const AGENT_CONVERSATION_PATH_PREFIX = '/agent/conversations'
export const NEW_CONVERSATION_ROUTE_ID = 'new'
export const AGENT_RETURN_LOCATION_STORAGE_KEY = 'xiaotuanbao-agent-return-location'
export const AGENT_SELECTED_CONVERSATION_STORAGE_KEY = 'xiaotuanbao-agent-selected-conversation'

export type AgentReturnLocation = {
  pathname: string
  search: string
  hash: string
}

export function isAgentConversationPath(pathname: string): boolean {
  return (
    pathname === AGENT_CONVERSATION_PATH_PREFIX ||
    pathname.startsWith(`${AGENT_CONVERSATION_PATH_PREFIX}/`)
  )
}

export function agentConversationPath(conversationId: string | null): string {
  return `${AGENT_CONVERSATION_PATH_PREFIX}/${conversationId ?? NEW_CONVERSATION_ROUTE_ID}`
}

export function isUsableReturnPath(pathname: string): boolean {
  if (!pathname.startsWith('/') || pathname.startsWith('//')) {
    return false
  }
  if (pathname.startsWith('/login') || pathname.startsWith('/platform')) {
    return false
  }
  return !isAgentConversationPath(pathname)
}

export function normalizeSearch(search: string): string {
  if (!search || search === '?') {
    return ''
  }
  return search.startsWith('?') ? search : `?${search}`
}

export function captureReturnLocation(location: {
  pathname: string
  search?: string
  searchStr?: string
  hash?: string
}): AgentReturnLocation | null {
  if (!isUsableReturnPath(location.pathname)) {
    return null
  }
  return {
    pathname: location.pathname,
    search: normalizeSearch(location.searchStr ?? location.search ?? ''),
    hash: location.hash ?? '',
  }
}

export function fallbackReturnLocation(): AgentReturnLocation {
  return { pathname: '/', search: '', hash: '' }
}

export function toReturnHref(location: AgentReturnLocation): string {
  return `${location.pathname}${location.search}${location.hash}`
}

export function toReturnNavigateOptions(location: AgentReturnLocation): {
  to: never
  search: never
  hash: string | undefined
} {
  const search = location.search
    ? Object.fromEntries(new URLSearchParams(location.search).entries())
    : undefined
  return {
    to: location.pathname as never,
    search: search as never,
    hash: location.hash ? location.hash.replace(/^#/, '') : undefined,
  }
}

export function parseStoredReturnLocation(raw: string | null): AgentReturnLocation | null {
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AgentReturnLocation>
    if (
      typeof parsed.pathname !== 'string' ||
      !isUsableReturnPath(parsed.pathname) ||
      (parsed.search != null && typeof parsed.search !== 'string') ||
      (parsed.hash != null && typeof parsed.hash !== 'string')
    ) {
      return null
    }
    return {
      pathname: parsed.pathname,
      search: normalizeSearch(parsed.search ?? ''),
      hash: parsed.hash ?? '',
    }
  } catch {
    return null
  }
}

export type StoredSelectedConversation = {
  conversationId: string
  title: string
}

export function parseStoredSelectedConversation(
  raw: string | null,
): StoredSelectedConversation | null {
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSelectedConversation>
    if (typeof parsed.conversationId !== 'string' || parsed.conversationId.length === 0) {
      return null
    }
    return {
      conversationId: parsed.conversationId,
      title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title : '新会话',
    }
  } catch {
    return null
  }
}

export function persistSelectedConversation(
  conversation: StoredSelectedConversation | null,
): void {
  if (typeof sessionStorage === 'undefined') {
    return
  }
  if (!conversation) {
    sessionStorage.removeItem(AGENT_SELECTED_CONVERSATION_STORAGE_KEY)
    return
  }
  sessionStorage.setItem(AGENT_SELECTED_CONVERSATION_STORAGE_KEY, JSON.stringify(conversation))
}

export function readPersistedSelectedConversation(): StoredSelectedConversation | null {
  if (typeof sessionStorage === 'undefined') {
    return null
  }
  return parseStoredSelectedConversation(
    sessionStorage.getItem(AGENT_SELECTED_CONVERSATION_STORAGE_KEY),
  )
}

export function persistReturnLocation(location: AgentReturnLocation | null): void {
  if (typeof sessionStorage === 'undefined') {
    return
  }
  if (!location) {
    sessionStorage.removeItem(AGENT_RETURN_LOCATION_STORAGE_KEY)
    return
  }
  sessionStorage.setItem(AGENT_RETURN_LOCATION_STORAGE_KEY, JSON.stringify(location))
}

export function readPersistedReturnLocation(): AgentReturnLocation | null {
  if (typeof sessionStorage === 'undefined') {
    return null
  }
  return parseStoredReturnLocation(sessionStorage.getItem(AGENT_RETURN_LOCATION_STORAGE_KEY))
}
