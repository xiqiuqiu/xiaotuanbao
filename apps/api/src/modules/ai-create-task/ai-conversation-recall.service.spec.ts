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

  it('按本次执行的 manifest 水位回读迟到的回答，同时排除后续用户输入', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { sequence: 3, kind: 'user_message', payload: { text: '当前排队输入' } },
      { sequence: 6, kind: 'agent_message', payload: { text: '上一轮迟到的执行结果' } },
    ])
    const findManifest = jest.fn().mockResolvedValue({ conversationVersion: 7 })
    const result = await serviceWith({
      aiInputBatch: { findFirst: async () => ({ conversationVersion: 3, userMessageEvent: { sequence: 3 } }) },
      aiContextManifest: { findFirst: findManifest },
      aiConversationEvent: { findMany },
    }).readHistory({
      organizationId: 'org-1', conversationId: 'conv-1', inputBatchId: 'batch-1',
      contextManifestId: 'manifest-1', rawInput: { sequenceStart: 1, sequenceEnd: 9 },
    })

    expect(findManifest).toHaveBeenCalledWith({
      where: { id: 'manifest-1', organizationId: 'org-1', conversationId: 'conv-1', inputBatchId: 'batch-1' },
      select: { conversationVersion: true },
    })
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      sequence: { gte: 1, lte: 7 },
      OR: [{ kind: { not: 'user_message' } }, { sequence: { lte: 3 } }],
    }) }))
    expect(result.conversationVersion).toBe(7)
    expect(result.events.map((event) => event.sequence)).toEqual([3, 6])
    expect(result.truncated).toBe(true)
  })

  it('拒绝不属于当前组织、会话和批次的 manifest，不回落扩大回读范围', async () => {
    const findMany = jest.fn()
    await expect(serviceWith({
      aiInputBatch: { findFirst: async () => ({ conversationVersion: 3 }) },
      aiContextManifest: { findFirst: async () => null },
      aiConversationEvent: { findMany },
    }).readHistory({
      organizationId: 'org-1', conversationId: 'conv-1', inputBatchId: 'batch-1',
      contextManifestId: 'other-manifest', rawInput: { sequenceStart: 1, sequenceEnd: 9 },
    })).rejects.toMatchObject({ response: { data: { code: 'DELEGATION_INVALID' } } })
    expect(findMany).not.toHaveBeenCalled()
  })

  it('不存在的页码不能伪装成成功读取空正文', async () => {
    const service = serviceWith({
      conversationSource: { findFirst: async () => ({ id: 'src-1' }) },
      conversationSourceParseRun: { findFirst: async () => ({ resultVersion: 1, pages: [{ pageNumber: 1, text: '正文' }] }) },
    })
    await expect(service.readSource({ organizationId: 'org-1', conversationId: 'conv-1', rawInput: { sourceId: 'src-1', parseVersion: 1, pageNumber: 2 } }))
      .rejects.toThrow('会话来源解析页不存在')
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
