import {
  CONVERSATION_HISTORY_READ_PREFACE,
  CONVERSATION_SOURCE_READ_PREFACE,
} from '@xiaotuanbao/ai-contracts'
import { AiConversationRecallService } from './ai-conversation-recall.service'

function serviceWith(prisma: unknown) {
  return new AiConversationRecallService(prisma as never)
}

describe('AiConversationRecallService', () => {
  it('按冻结 conversationVersion 回读原文并附带 locator，不把结果标成业务事实', async () => {
    const prisma = {
      aiInputBatch: {
        findFirst: async () => ({ conversationVersion: 4 }),
      },
      aiConversationEvent: {
        findMany: async () => [
          {
            sequence: 2,
            kind: 'user_message',
            payload: { text: '出团日期还没定' },
          },
          {
            sequence: 3,
            kind: 'agent_message',
            payload: { text: '请确认出发日' },
          },
        ],
      },
    }
    const result = await serviceWith(prisma).readHistory({
      organizationId: 'org-1',
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      rawInput: { sequenceStart: 2, sequenceEnd: 4 },
    })
    expect(result.preface).toBe(CONVERSATION_HISTORY_READ_PREFACE)
    expect(result.conversationVersion).toBe(4)
    expect(result.events.map((event) => event.sequence)).toEqual([2, 3])
    expect(result.events[0]?.locator).toMatchObject({
      kind: 'conversation_event',
      conversationId: 'conv-1',
      sequence: 2,
    })
    expect(result.events[0]?.locator.contentDigest).toHaveLength(64)
  })

  it('不回读超过当前批次冻结版本的后续事件', async () => {
    const prisma = {
      aiInputBatch: {
        findFirst: async () => ({ conversationVersion: 2 }),
      },
      aiConversationEvent: {
        findMany: async (args: { where: { sequence: { lte: number } } }) => {
          expect(args.where.sequence.lte).toBe(2)
          return [
            {
              sequence: 2,
              kind: 'user_message',
              payload: { text: '冻结内的问题' },
            },
          ]
        },
      },
    }
    const result = await serviceWith(prisma).readHistory({
      organizationId: 'org-1',
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      rawInput: { sequenceStart: 1, sequenceEnd: 9 },
    })
    expect(result.truncated).toBe(true)
    expect(result.events).toHaveLength(1)
  })

  it('按当前会话来源与解析版本回读摘录', async () => {
    const prisma = {
      conversationSource: {
        findFirst: async () => ({ id: 'src-1' }),
      },
      conversationSourceParseRun: {
        findFirst: async () => ({
          resultVersion: 2,
          pages: [{ pageNumber: 1, text: '喀纳斯行程原文' }],
        }),
      },
    }
    const result = await serviceWith(prisma).readSource({
      organizationId: 'org-1',
      conversationId: 'conv-1',
      rawInput: { sourceId: 'src-1', parseVersion: 2, pageNumber: 1 },
    })
    expect(result.preface).toBe(CONVERSATION_SOURCE_READ_PREFACE)
    expect(result.text).toContain('喀纳斯行程原文')
    expect(result.locator).toMatchObject({
      kind: 'conversation_source',
      conversationId: 'conv-1',
      sourceId: 'src-1',
      parseVersion: 2,
      pageNumber: 1,
    })
  })
})
