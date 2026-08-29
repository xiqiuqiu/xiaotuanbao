import { AI_CREATE_SYSTEM_INSTRUCTIONS } from './ai-create-model-contract'
import { CONVERSATION_GENERAL_INSTRUCTIONS } from './conversation-general-definitions'

const INTERNAL_IDENTIFIERS = [
  'routeConversation',
  'propose_departure_creation',
  'proposeReviewPackage',
  'readConversationSource',
  'readConversationHistory',
  'getTaskContext',
  'getMaterialParseResult',
  'searchRouteTemplates',
  'replyPlaintext',
  'awaitReviewPackageDecision',
] as const

const ENGLISH_RUN = /[A-Za-z][A-Za-z0-9 ,,:;'"`()[\]{}.!?\-/]{19,}/g
const DEFAULT_INSTRUCTION_SNIPPETS = [
  CONVERSATION_GENERAL_INSTRUCTIONS,
  AI_CREATE_SYSTEM_INSTRUCTIONS,
] as const

function stripNeedle(haystack: string, needle: string): string {
  const trimmed = needle.trim()
  if (trimmed.length < 24) {
    return haystack
  }
  let next = haystack.split(trimmed).join('')
  const windowSize = 24
  for (let index = 0; index + windowSize <= trimmed.length; index += 1) {
    const piece = trimmed.slice(index, index + windowSize)
    if (next.includes(piece)) {
      next = next.split(piece).join('')
    }
  }
  return next
}

/** 给 User 看的思考过程：去掉系统提示原文、内部工具名和英文 chain-of-thought。 */
export function sanitizeVisibleReasoning(
  text: string,
  leakedInstructionSnippets: readonly string[] = DEFAULT_INSTRUCTION_SNIPPETS,
): string {
  let next = text.replace(/\u0000/g, '')
  for (const snippet of leakedInstructionSnippets) {
    next = stripNeedle(next, snippet)
  }
  for (const name of INTERNAL_IDENTIFIERS) {
    next = next.replaceAll(name, '')
  }
  next = next.replace(ENGLISH_RUN, '')
  return next
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
