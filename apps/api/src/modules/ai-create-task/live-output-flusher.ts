import {
  LIVE_OUTPUT_EARLY_FLUSH_CHARS,
  LIVE_OUTPUT_FLUSH_MS,
  type AgentLiveOutput,
  type LiveOutputIdentity,
} from './agent-live-output'

export class LiveOutputFlusher {
  private revision = 0
  private lastFlushedText: string | null = null
  private pendingText = ''
  private timer: ReturnType<typeof setTimeout> | null = null
  private firstFlushDone = false
  private chain: Promise<void> = Promise.resolve()
  private disposed = false

  constructor(
    private readonly liveOutput: AgentLiveOutput,
    private readonly identity: LiveOutputIdentity,
  ) {}

  push(text: string): void {
    if (this.disposed) {
      return
    }
    this.pendingText = text
    if (!this.firstFlushDone) {
      this.firstFlushDone = true
      this.enqueueFlush()
      return
    }
    const newly = Math.max(0, text.length - (this.lastFlushedText?.length ?? 0))
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
      if (this.lastFlushedText === text) {
        return
      }
      this.revision += 1
      this.lastFlushedText = text
      await this.liveOutput.publish({
        ...this.identity,
        revision: this.revision,
        reasoningText: '',
        text,
      })
    })
  }
}
