import { sanitizeVisibleReasoning } from '@xiaotuanbao/ai-contracts'
import {
  LIVE_OUTPUT_EARLY_FLUSH_CHARS,
  LIVE_OUTPUT_FLUSH_MS,
  type AgentLiveOutput,
  type LiveOutputIdentity,
} from './agent-live-output'

export type LiveOutputUpdate = {
  text?: string
  reasoningText?: string
}

export class LiveOutputFlusher {
  private revision = 0
  private lastFlushedText: string | null = null
  private lastFlushedReasoning: string | null = null
  private pendingText = ''
  private pendingReasoning = ''
  private timer: ReturnType<typeof setTimeout> | null = null
  private firstFlushDone = false
  private chain: Promise<void> = Promise.resolve()
  private disposed = false

  constructor(
    private readonly liveOutput: AgentLiveOutput,
    private readonly identity: LiveOutputIdentity,
    private readonly onPublishError?: (error: unknown) => void,
  ) {}

  push(update: LiveOutputUpdate): void {
    if (this.disposed) {
      return
    }
    if (update.text !== undefined) {
      this.pendingText = update.text
    }
    if (update.reasoningText !== undefined) {
      this.pendingReasoning = update.reasoningText
    }
    if (!this.firstFlushDone || this.reasoningReplaced()) {
      this.firstFlushDone = true
      this.enqueueFlush()
      return
    }
    const newly = Math.max(
      0,
      this.pendingText.length - (this.lastFlushedText?.length ?? 0),
      this.pendingReasoning.length - (this.lastFlushedReasoning?.length ?? 0),
    )
    if (newly >= LIVE_OUTPUT_EARLY_FLUSH_CHARS) {
      this.clearTimer()
      this.enqueueFlush()
      return
    }
    this.schedule()
  }

  async flush(): Promise<void> {
    this.clearTimer()
    this.enqueueFlush()
    await this.chain
  }

  dispose(): void {
    this.disposed = true
    this.clearTimer()
  }

  private reasoningReplaced(): boolean {
    const previous = this.lastFlushedReasoning
    if (previous == null || previous === '') {
      return false
    }
    const next = sanitizeVisibleReasoning(this.pendingReasoning)
    return next !== previous && !next.startsWith(previous)
  }

  private schedule(): void {
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      this.enqueueFlush()
    }, LIVE_OUTPUT_FLUSH_MS)
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private enqueueFlush(): void {
    this.chain = this.chain.then(async () => {
      if (this.disposed) {
        return
      }
      const text = this.pendingText
      const reasoningText = sanitizeVisibleReasoning(this.pendingReasoning)
      if (this.lastFlushedText === text && this.lastFlushedReasoning === reasoningText) {
        return
      }
      this.revision += 1
      try {
        await this.liveOutput.publish({
          ...this.identity,
          revision: this.revision,
          reasoningText,
          text,
        })
        this.lastFlushedText = text
        this.lastFlushedReasoning = reasoningText
      } catch (error: unknown) {
        this.onPublishError?.(error)
      }
    })
  }
}
