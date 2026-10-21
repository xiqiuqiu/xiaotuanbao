import type { sendAgentConversationText } from '@/services/agent-conversation.service'

const pending = new Map<string, { fingerprint: string; key: string }>()
const fileIds = new WeakMap<File, string>()
const storageKey = (scope: string) => `conversation-pending-send:${scope}`

export function pendingSendKey(scope: string, payload: Parameters<typeof sendAgentConversationText>[1]): string {
  const fingerprint = JSON.stringify({ ...payload, files: (payload.files ?? []).map(file => {
    let id = fileIds.get(file)
    if (!id) { id = crypto.randomUUID(); fileIds.set(file, id) }
    return id
  }) })
  let previous = pending.get(scope)
  if (!previous) {
    try {
      const stored = JSON.parse(sessionStorage.getItem(storageKey(scope)) ?? 'null')
      if (typeof stored?.fingerprint === 'string' && typeof stored?.key === 'string') previous = stored
    } catch { /* Storage is optional; retain the in-memory attempt. */ }
  }
  const next = { fingerprint, key: previous?.fingerprint === fingerprint ? previous.key : crypto.randomUUID() }
  pending.set(scope, next)
  try { sessionStorage.setItem(storageKey(scope), JSON.stringify(next)) } catch { /* In-memory retry remains available. */ }
  return next.key
}

export function clearPendingSendKey(scope: string, key?: string) {
  if (key && pending.get(scope)?.key !== key) return
  pending.delete(scope)
  try { sessionStorage.removeItem(storageKey(scope)) } catch { /* Storage may be unavailable. */ }
}

export function clearPendingSendKeys(conversationId?: string) {
  const scopes = new Set(pending.keys())
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key?.startsWith('conversation-pending-send:')) scopes.add(key.slice('conversation-pending-send:'.length))
    }
  } catch { /* Also clear memory when browser storage is unavailable. */ }
  for (const scope of scopes) {
    if (!conversationId || scope.endsWith(`:${conversationId}`)) clearPendingSendKey(scope)
  }
}
