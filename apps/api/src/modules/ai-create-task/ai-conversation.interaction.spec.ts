import { BadRequestException } from '@nestjs/common'
import {
  AiConversationInteractionStatus,
  AiConversationInteractionType,
  type AiConversationInteraction,
} from '@prisma/client'
import { resolveReplyText } from './ai-conversation.interaction'

function interaction(
  overrides: Partial<AiConversationInteraction> = {},
): AiConversationInteraction {
  return {
    id: 'int-1',
    organizationId: 'org-1',
    conversationId: 'conv-1',
    inputBatchId: 'batch-1',
    eventId: 'event-1',
    type: AiConversationInteractionType.free_text,
    prompt: '补充出发城市',
    options: null,
    responseSchema: { type: 'string', minLength: 1, maxLength: 8 },
    status: AiConversationInteractionStatus.pending,
    version: 1,
    responseJson: null,
    createdAt: new Date('2026-08-15T00:00:00.000Z'),
    updatedAt: new Date('2026-08-15T00:00:00.000Z'),
    ...overrides,
  }
}

describe('resolveReplyText', () => {
  it('rejects free-text replies that exceed persisted responseSchema.maxLength', () => {
    expect(() => resolveReplyText(interaction(), 'abcdefghijk')).toThrow(BadRequestException)
    expect(() => resolveReplyText(interaction(), 'abcdefghijk')).toThrow('回答超出允许长度')
  })

  it('accepts free-text replies within persisted maxLength', () => {
    expect(resolveReplyText(interaction(), '  北京  ')).toEqual({ text: '北京' })
  })

  it('rejects unknown single-choice option ids', () => {
    const choice = interaction({
      type: AiConversationInteractionType.single_choice,
      options: [
        { id: '3d', label: '3天' },
        { id: '5d', label: '5天' },
      ],
      responseSchema: { type: 'enum', options: ['3d', '5d'] },
    })
    expect(() => resolveReplyText(choice, '', '7d')).toThrow('请选择一个有效选项')
  })
})
