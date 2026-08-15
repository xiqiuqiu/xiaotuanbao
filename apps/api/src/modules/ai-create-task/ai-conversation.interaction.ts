import { BadRequestException } from '@nestjs/common'
import {
  AiConversationInteractionStatus,
  AiConversationInteractionType,
  type AiConversationInteraction,
} from '@prisma/client'
import { parseInteractionOptions } from './ai-conversation.mapper'

export type ConversationReplyInput = {
  replyToEventId?: string
  interactionId?: string
  interactionVersion?: number
  selectedOptionId?: string
}

export function isReplyAttempt(reply?: ConversationReplyInput): boolean {
  return Boolean(
    reply?.replyToEventId ||
      reply?.interactionId ||
      reply?.interactionVersion != null ||
      reply?.selectedOptionId,
  )
}

export function requireCompleteReply(reply?: ConversationReplyInput): {
  replyToEventId: string
  interactionId: string
  interactionVersion: number
  selectedOptionId?: string
} {
  if (
    !reply?.replyToEventId?.trim() ||
    !reply.interactionId?.trim() ||
    reply.interactionVersion == null
  ) {
    throw new BadRequestException(
      '回答追问必须同时提供 replyToEventId、interactionId 与 interactionVersion',
    )
  }
  return {
    replyToEventId: reply.replyToEventId.trim(),
    interactionId: reply.interactionId.trim(),
    interactionVersion: reply.interactionVersion,
    selectedOptionId: reply.selectedOptionId?.trim() || undefined,
  }
}

export function responseSchemaFor(
  type: AiConversationInteractionType,
  options: Array<{ id: string; label: string }>,
): Record<string, unknown> {
  if (type === AiConversationInteractionType.single_choice) {
    return { type: 'enum', options: options.map((option) => option.id) }
  }
  return { type: 'string', minLength: 1, maxLength: 8000 }
}

export function resolveReplyText(
  interaction: AiConversationInteraction,
  text: string,
  selectedOptionId?: string,
): { text: string; selectedOptionId?: string } {
  const options = parseInteractionOptions(interaction.options)
  if (interaction.type === AiConversationInteractionType.single_choice) {
    const option = options.find((item) => item.id === selectedOptionId)
    if (!option) {
      throw new BadRequestException('请选择一个有效选项')
    }
    return { text: option.label, selectedOptionId: option.id }
  }
  if (selectedOptionId) {
    throw new BadRequestException('自由文本追问不接受选项')
  }
  const trimmed = text.trim()
  if (!trimmed) {
    throw new BadRequestException('请回答当前追问')
  }
  const schema = asRecord(interaction.responseSchema)
  const maxLength = typeof schema.maxLength === 'number' ? schema.maxLength : 8000
  if (trimmed.length > maxLength) {
    throw new BadRequestException('回答超出允许长度')
  }
  return { text: trimmed }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

export function staleInteractionMessage(interaction: AiConversationInteraction): string {
  if (interaction.status !== AiConversationInteractionStatus.pending) {
    return '该追问已被回答或取消'
  }
  return '追问版本已过期，请刷新后重试'
}
