import {
  DEPARTURE_CREATION_GOAL_INTENT_KEY,
  DEPARTURE_CREATION_ROUTING_DECISION,
} from './task-descriptor'
import {
  conversationRoutingInputSchema,
  conversationRoutingOutputSchema,
  parseCreatePartnerOptionLabel,
} from './conversation-routing'

describe('conversation routing schema #439', () => {
  it('create_partner 选项必须携带可解析的客户名', () => {
    const clarify = (label: string) =>
      conversationRoutingInputSchema.safeParse({
        decision: 'request_clarification',
        prompt: '没找到该客户',
        options: [
          { id: 'create_partner', label },
          { id: 'other_partner', label: '改用其他客户' },
        ],
      }).success
    expect(clarify('创建“上海游乐旅行社”')).toBe(true)
    expect(clarify('创建「上海游乐旅行社」')).toBe(false)
    expect(parseCreatePartnerOptionLabel(' 创建“上海游乐旅行社” ')).toBe('上海游乐旅行社')
    expect(parseCreatePartnerOptionLabel('改用其他客户')).toBeNull()
  })

  it('accepts registered Task Descriptor creation decisions and rejects unregistered ones', () => {
    expect(
      conversationRoutingInputSchema.parse({
        decision: DEPARTURE_CREATION_ROUTING_DECISION,
        goal: '创建七月喀纳斯团',
      }),
    ).toEqual({
      decision: 'propose_departure_creation',
      goal: '创建七月喀纳斯团',
    })

    expect(() =>
      conversationRoutingInputSchema.parse({
        decision: 'propose_partner_accounts',
        goal: '查询往来账款',
      }),
    ).toThrow()
  })

  it('keeps clarification as a separate registered-intent path', () => {
    expect(
      conversationRoutingInputSchema.parse({
        decision: 'request_clarification',
        prompt: '你希望新建发团，还是查询已有发团？',
        options: [
          { id: 'create', label: '新建发团' },
          { id: 'query', label: '查询发团' },
        ],
      }),
    ).toMatchObject({ decision: 'request_clarification' })
  })

  it('accepts a successful routing output whose intent key matches the registered descriptor', () => {
    expect(
      conversationRoutingOutputSchema.parse({
        status: 'accepted',
        decision: DEPARTURE_CREATION_ROUTING_DECISION,
        registeredIntent: {
          key: DEPARTURE_CREATION_GOAL_INTENT_KEY,
          confidence: 'high',
          goal: '创建七月喀纳斯团',
        },
      }),
    ).toMatchObject({
      decision: 'propose_departure_creation',
      registeredIntent: { key: DEPARTURE_CREATION_GOAL_INTENT_KEY },
    })
  })
})
