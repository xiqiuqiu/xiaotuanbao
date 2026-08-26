import { createHash } from 'node:crypto'
import { Injectable, NotFoundException } from '@nestjs/common'
import {
  CONVERSATION_HISTORY_READ_MAX_CHARS,
  CONVERSATION_HISTORY_READ_MAX_EVENTS,
  CONVERSATION_HISTORY_READ_PREFACE,
  CONVERSATION_SOURCE_READ_MAX_CHARS,
  CONVERSATION_SOURCE_READ_PREFACE,
  eventLocatorFor,
  projectParseResultPages,
  readConversationHistoryModelInputSchema,
  readConversationHistoryOutputSchema,
  readConversationSourceModelInputSchema,
  readConversationSourceOutputSchema,
  type ReadConversationHistoryOutput,
  type ReadConversationSourceOutput,
} from '@xiaotuanbao/ai-contracts'
import { ConversationSourceParseRunStatus } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { conversationEventText } from './ai-context-manifest'
import { AiCollaborationHttpException } from './ai-collaboration.http-exception'

@Injectable()
export class AiConversationRecallService {
  constructor(private readonly prisma: PrismaService) {}

  async readHistory(params: {
    organizationId: string
    conversationId: string
    inputBatchId: string
    rawInput: unknown
  }): Promise<ReadConversationHistoryOutput> {
    let input: { sequenceStart: number; sequenceEnd: number }
    try {
      input = readConversationHistoryModelInputSchema.parse(params.rawInput)
    } catch {
      throw AiCollaborationHttpException.fromCode('INVALID_FORMAT')
    }
    const batch = await this.prisma.aiInputBatch.findFirst({
      where: {
        id: params.inputBatchId,
        conversationId: params.conversationId,
        organizationId: params.organizationId,
      },
      select: { conversationVersion: true },
    })
    if (!batch) {
      throw new NotFoundException('输入批次不存在')
    }
    const sequenceEnd = Math.min(input.sequenceEnd, batch.conversationVersion)
    const events = await this.prisma.aiConversationEvent.findMany({
      where: {
        conversationId: params.conversationId,
        organizationId: params.organizationId,
        sequence: { gte: input.sequenceStart, lte: sequenceEnd },
        kind: { in: ['user_message', 'agent_message', 'batch_status', 'error'] },
      },
      orderBy: { sequence: 'asc' },
      take: CONVERSATION_HISTORY_READ_MAX_EVENTS,
    })
    let remaining = CONVERSATION_HISTORY_READ_MAX_CHARS
    let truncated = sequenceEnd < input.sequenceEnd
    const projected = events.flatMap((event) => {
      const text = conversationEventText(event.payload)
      if (remaining <= 0) {
        truncated = true
        return []
      }
      const clipped = text.length > remaining ? text.slice(0, remaining) : text
      if (clipped.length < text.length) {
        truncated = true
      }
      remaining -= clipped.length
      return [
        {
          sequence: event.sequence,
          kind: event.kind as 'user_message' | 'agent_message' | 'batch_status' | 'error',
          text: clipped,
          locator: eventLocatorFor(params.conversationId, {
            sequence: event.sequence,
            kind: event.kind,
            text,
          }),
        },
      ]
    })
    return readConversationHistoryOutputSchema.parse({
      conversationId: params.conversationId,
      conversationVersion: batch.conversationVersion,
      truncated,
      preface: CONVERSATION_HISTORY_READ_PREFACE,
      events: projected,
    })
  }

  async readSource(params: {
    organizationId: string
    conversationId: string
    rawInput: unknown
  }): Promise<ReadConversationSourceOutput> {
    let input: { sourceId: string; parseVersion: number; pageNumber?: number }
    try {
      input = readConversationSourceModelInputSchema.parse(params.rawInput)
    } catch {
      throw AiCollaborationHttpException.fromCode('INVALID_FORMAT')
    }
    const source = await this.prisma.conversationSource.findFirst({
      where: {
        id: input.sourceId,
        conversationId: params.conversationId,
        organizationId: params.organizationId,
      },
      select: { id: true },
    })
    if (!source) {
      throw new NotFoundException('会话来源不存在')
    }
    const run = await this.prisma.conversationSourceParseRun.findFirst({
      where: {
        sourceId: input.sourceId,
        resultVersion: input.parseVersion,
        status: ConversationSourceParseRunStatus.succeeded,
      },
      select: { resultVersion: true, pages: true },
    })
    if (!run) {
      throw new NotFoundException('会话来源解析结果不存在')
    }
    const pages = Array.isArray(run.pages)
      ? run.pages.flatMap((page) => {
          if (!page || typeof page !== 'object' || Array.isArray(page)) {
            return []
          }
          const record = page as { pageNumber?: unknown; text?: unknown }
          if (typeof record.pageNumber !== 'number' || typeof record.text !== 'string') {
            return []
          }
          return [{ pageNumber: record.pageNumber, text: record.text }]
        })
      : []
    const projected = projectParseResultPages(pages, input.pageNumber)
    const selected = projected.pages.map((page) => page.text).join('\n')
    const clipped =
      selected.length > CONVERSATION_SOURCE_READ_MAX_CHARS
        ? selected.slice(0, CONVERSATION_SOURCE_READ_MAX_CHARS)
        : selected
    const truncated = projected.truncated || clipped.length < selected.length
    const digestSource = clipped
    return readConversationSourceOutputSchema.parse({
      conversationId: params.conversationId,
      sourceId: input.sourceId,
      parseVersion: run.resultVersion,
      pageCount: projected.pageCount,
      truncated,
      preface: CONVERSATION_SOURCE_READ_PREFACE,
      locator: {
        kind: 'conversation_source',
        conversationId: params.conversationId,
        sourceId: input.sourceId,
        parseVersion: run.resultVersion,
        pageNumber: input.pageNumber ?? null,
        contentDigest: createHash('sha256').update(digestSource, 'utf8').digest('hex'),
      },
      text: clipped,
    })
  }
}
