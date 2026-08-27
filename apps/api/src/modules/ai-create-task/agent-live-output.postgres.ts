import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { EventEmitter } from 'node:events'
import { Client } from 'pg'
import { Observable } from 'rxjs'
import { PrismaService } from '../../database/prisma/prisma.service'
import {
  LIVE_OUTPUT_NOTIFY_CHANNEL,
  LIVE_OUTPUT_TTL_MS,
  type AgentLiveOutput,
  type LiveOutputSnapshot,
} from './agent-live-output'

type LiveOutputRow = {
  attemptId: string
  organizationId: string
  conversationId: string
  inputBatchId: string
  generation: number
  revision: number
  reasoningText: string
  text: string
  expiresAt: Date
}

@Injectable()
export class PostgresAgentLiveOutput implements AgentLiveOutput, OnModuleDestroy {
  private readonly logger = new Logger(PostgresAgentLiveOutput.name)
  private readonly emitter = new EventEmitter()
  private listenClient: Client | null = null
  private listenStarted = false

  constructor(private readonly prisma: PrismaService) {
    this.emitter.setMaxListeners(100)
  }

  async publish(snapshot: LiveOutputSnapshot): Promise<void> {
    const expiresAt = new Date(Date.now() + LIVE_OUTPUT_TTL_MS)
    await this.prisma.$transaction(async (tx) => {
      await tx.aiAgentLiveOutput.deleteMany({
        where: {
          conversationId: snapshot.conversationId,
          attemptId: { not: snapshot.attemptId },
        },
      })
      await tx.aiAgentLiveOutput.upsert({
        where: { attemptId: snapshot.attemptId },
        create: {
          attemptId: snapshot.attemptId,
          organizationId: snapshot.organizationId,
          conversationId: snapshot.conversationId,
          inputBatchId: snapshot.batchId,
          generation: snapshot.generation,
          revision: snapshot.revision,
          reasoningText: snapshot.reasoningText,
          text: snapshot.text,
          expiresAt,
        },
        update: {
          generation: snapshot.generation,
          revision: snapshot.revision,
          reasoningText: snapshot.reasoningText,
          text: snapshot.text,
          expiresAt,
        },
      })
      await tx.$executeRaw`SELECT pg_notify(${LIVE_OUTPUT_NOTIFY_CHANNEL}, ${snapshot.attemptId})`
    })
    this.emitter.emit(snapshot.conversationId, snapshot)
  }

  observe(conversationId: string): Observable<LiveOutputSnapshot> {
    this.ensureListen()
    return new Observable((subscriber) => {
      const handler = (snapshot: LiveOutputSnapshot) => {
        subscriber.next(snapshot)
      }
      this.emitter.on(conversationId, handler)
      return () => {
        this.emitter.off(conversationId, handler)
      }
    })
  }

  async getCurrent(conversationId: string): Promise<LiveOutputSnapshot | null> {
    const row = await this.prisma.aiAgentLiveOutput.findFirst({
      where: { conversationId, expiresAt: { gt: new Date() } },
      orderBy: [{ generation: 'desc' }, { revision: 'desc' }],
    })
    return row ? toSnapshot(row) : null
  }

  async clear(attemptId: string): Promise<void> {
    await this.prisma.aiAgentLiveOutput.deleteMany({ where: { attemptId } })
    await this.prisma.$executeRaw`SELECT pg_notify(${LIVE_OUTPUT_NOTIFY_CHANNEL}, ${attemptId})`
  }

  async supersede(conversationId: string, attemptId: string): Promise<void> {
    await this.prisma.aiAgentLiveOutput.deleteMany({
      where: { conversationId, attemptId: { not: attemptId } },
    })
  }

  async onModuleDestroy(): Promise<void> {
    const client = this.listenClient
    this.listenClient = null
    if (!client) {
      return
    }
    try {
      await client.end()
    } catch (error: unknown) {
      this.logger.warn(`关闭即时输出 LISTEN 失败: ${String(error)}`)
    }
  }

  private ensureListen(): void {
    if (this.listenStarted) {
      return
    }
    this.listenStarted = true
    const connectionString = listenConnectionString(process.env.DATABASE_URL)
    if (!connectionString) {
      this.logger.warn('DATABASE_URL 缺失，跨进程即时输出通知不可用')
      return
    }
    const client = new Client({ connectionString })
    this.listenClient = client
    client.on('notification', (message) => {
      if (message.channel !== LIVE_OUTPUT_NOTIFY_CHANNEL || !message.payload) {
        return
      }
      void this.emitFromAttempt(message.payload)
    })
    client.on('error', (error) => {
      this.logger.warn(`即时输出 LISTEN 断开: ${String(error)}`)
      this.listenStarted = false
      this.listenClient = null
      void client.end().catch(() => undefined)
    })
    void client
      .connect()
      .then(() => client.query(`LISTEN ${LIVE_OUTPUT_NOTIFY_CHANNEL}`))
      .catch((error: unknown) => {
        this.logger.warn(`即时输出 LISTEN 连接失败: ${String(error)}`)
        this.listenStarted = false
        this.listenClient = null
      })
  }

  private async emitFromAttempt(attemptId: string): Promise<void> {
    const row = await this.prisma.aiAgentLiveOutput.findUnique({
      where: { attemptId },
    })
    if (!row || row.expiresAt <= new Date()) {
      return
    }
    this.emitter.emit(row.conversationId, toSnapshot(row))
  }
}

function toSnapshot(row: LiveOutputRow): LiveOutputSnapshot {
  return {
    attemptId: row.attemptId,
    organizationId: row.organizationId,
    conversationId: row.conversationId,
    batchId: row.inputBatchId,
    generation: row.generation,
    revision: row.revision,
    reasoningText: row.reasoningText,
    text: row.text,
  }
}

export function listenConnectionString(raw: string | undefined): string | null {
  const value = raw?.trim()
  if (!value) {
    return null
  }
  try {
    const url = new URL(value)
    url.searchParams.delete('schema')
    url.searchParams.delete('connection_limit')
    url.searchParams.delete('pool_timeout')
    url.searchParams.delete('socket_timeout')
    return url.toString()
  } catch {
    return value
  }
}
