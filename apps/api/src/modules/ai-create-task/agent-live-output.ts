import type { Observable } from 'rxjs'

export const AGENT_LIVE_OUTPUT = Symbol('AGENT_LIVE_OUTPUT')

export const LIVE_OUTPUT_TTL_MS = 30 * 60 * 1000
export const LIVE_OUTPUT_FLUSH_MS = 100
export const LIVE_OUTPUT_EARLY_FLUSH_CHARS = 128
export const LIVE_OUTPUT_NOTIFY_CHANNEL = 'ai_agent_live_output'
/** 即时输出只承载可丢失的投影；慢盘上的单次 upsert 不得用默认 5s 杀掉 Worker。 */
export const LIVE_OUTPUT_TRANSACTION_TIMEOUT_MS = 20_000

export type LiveOutputSnapshot = {
  attemptId: string
  organizationId: string
  conversationId: string
  batchId: string
  generation: number
  revision: number
  reasoningText: string
  text: string
}

export type LiveOutputIdentity = {
  attemptId: string
  organizationId: string
  conversationId: string
  batchId: string
  generation: number
}

export interface AgentLiveOutput {
  publish(snapshot: LiveOutputSnapshot): Promise<void>
  observe(conversationId: string): Observable<LiveOutputSnapshot>
  getCurrent(conversationId: string): Promise<LiveOutputSnapshot | null>
  clear(attemptId: string): Promise<void>
  /** 新 Attempt 取代当前即时输出：删除同会话上其它 Attempt 的残留行。 */
  supersede(conversationId: string, attemptId: string): Promise<void>
}
