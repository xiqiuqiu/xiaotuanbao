import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import type {
  AiActionConversationFact,
  AiActionConversationSourceFact,
  AiActionMaterialFact,
  AiActionMaterialPinFact,
  AiActionTargetAuthority,
  AiActionTaskFact,
} from './ai-action.target'

type TargetAuthorityDb = {
  agentTask: Prisma.TransactionClient['agentTask']
  conversationSource: Prisma.TransactionClient['conversationSource']
  conversationSourceParseRun: Prisma.TransactionClient['conversationSourceParseRun']
  inputBatchSource: Prisma.TransactionClient['inputBatchSource']
  aiConversation: Prisma.TransactionClient['aiConversation']
}

export function createPrismaAiActionTargetAuthority(client: TargetAuthorityDb): AiActionTargetAuthority {
  return {
    async findTask(taskId) {
      const task = await client.agentTask.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          organizationId: true,
          ownerUserId: true,
          departureCreationTask: {
            select: {
              draft: { select: { id: true, version: true } },
            },
          },
        },
      })
      if (!task) {
        return null
      }
      return toTaskFact(task)
    },
    async findMaterial(materialId) {
      // AI 建团读资料的权威对象是当前 InputBatch 固定的会话来源解析版本（targetKind 沿用 departure_material）。
      const source = await client.conversationSource.findUnique({
        where: { id: materialId },
        select: { id: true, organizationId: true },
      })
      return source ? toMaterialFact(source) : null
    },
    async findPinnedMaterial(params) {
      const pin = await client.inputBatchSource.findUnique({
        where: {
          inputBatchId_sourceId: {
            inputBatchId: params.inputBatchId,
            sourceId: params.materialId,
          },
        },
        select: {
          sourceId: true,
          organizationId: true,
          parseVersion: true,
        },
      })
      return pin ? toPinFact(pin) : null
    },
    async findConversation(conversationId) {
      const conversation = await client.aiConversation.findUnique({
        where: { id: conversationId },
        select: { id: true, organizationId: true, creatorUserId: true },
      })
      return conversation ? toConversationFact(conversation) : null
    },
    async findConversationSource(params) {
      const source = await client.conversationSource.findUnique({
        where: { id: params.sourceId },
        select: { id: true, organizationId: true, conversationId: true },
      })
      if (!source) {
        return null
      }
      const run = await client.conversationSourceParseRun.findFirst({
        where: {
          sourceId: params.sourceId,
          resultVersion: params.parseVersion,
          status: 'succeeded',
        },
        select: { resultVersion: true },
      })
      return {
        id: source.id,
        organizationId: source.organizationId,
        conversationId: source.conversationId,
        parseVersion: run?.resultVersion ?? null,
      }
    },
  }
}

@Injectable()
export class PrismaAiActionTargetAuthority implements AiActionTargetAuthority {
  private readonly inner: AiActionTargetAuthority

  constructor(prisma: PrismaService) {
    this.inner = createPrismaAiActionTargetAuthority(prisma)
  }

  findTask(taskId: string): Promise<AiActionTaskFact | null> {
    return this.inner.findTask(taskId)
  }

  findMaterial(materialId: string): Promise<AiActionMaterialFact | null> {
    return this.inner.findMaterial(materialId)
  }

  findPinnedMaterial(params: {
    inputBatchId: string
    materialId: string
  }): Promise<AiActionMaterialPinFact | null> {
    return this.inner.findPinnedMaterial(params)
  }

  findConversation(conversationId: string): Promise<AiActionConversationFact | null> {
    return this.inner.findConversation(conversationId)
  }

  findConversationSource(params: {
    sourceId: string
    parseVersion: number
  }): Promise<AiActionConversationSourceFact | null> {
    return this.inner.findConversationSource(params)
  }
}

function toTaskFact(task: {
  id: string
  organizationId: string
  ownerUserId: string
  departureCreationTask: { draft: { id: string; version: number } | null } | null
}): AiActionTaskFact {
  return {
    id: task.id,
    organizationId: task.organizationId,
    ownerUserId: task.ownerUserId,
    draftId: task.departureCreationTask?.draft?.id ?? null,
    draftVersion: task.departureCreationTask?.draft?.version ?? null,
  }
}

function toMaterialFact(source: { id: string; organizationId: string }): AiActionMaterialFact {
  return { id: source.id, organizationId: source.organizationId }
}

function toPinFact(pin: {
  sourceId: string
  organizationId: string
  parseVersion: number | null
}): AiActionMaterialPinFact {
  return {
    materialId: pin.sourceId,
    organizationId: pin.organizationId,
    parseResultVersion: pin.parseVersion,
  }
}

function toConversationFact(conversation: {
  id: string
  organizationId: string
  creatorUserId: string
}): AiActionConversationFact {
  return {
    id: conversation.id,
    organizationId: conversation.organizationId,
    creatorUserId: conversation.creatorUserId,
  }
}
