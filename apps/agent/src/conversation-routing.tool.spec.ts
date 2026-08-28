import { DEPARTURE_CREATION_GOAL_INTENT_KEY } from '@xiaotuanbao/ai-contracts'
import { createConversationRoutingTool } from './conversation-routing.tool'

describe('createConversationRoutingTool', () => {
  it('maps the bounded departure decision to a registered intent without agent or capability fields', async () => {
    const tool = createConversationRoutingTool()

    await expect(
      tool.execute?.(
        {
          decision: 'propose_departure_creation',
          goal: '创建七月喀纳斯团',
          agentDefinition: { key: 'evil.agent', version: 999 },
          grantedCapabilities: ['everything'],
        } as never,
        {} as never,
      ),
    ).resolves.toEqual({
      status: 'accepted',
      decision: 'propose_departure_creation',
      registeredIntent: {
        key: DEPARTURE_CREATION_GOAL_INTENT_KEY,
        confidence: 'high',
        goal: '创建七月喀纳斯团',
      },
    })
  })

  it('rejects an unregistered task-creation decision instead of mapping it', async () => {
    const tool = createConversationRoutingTool()

    await expect(
      tool.execute?.(
        {
          decision: 'propose_partner_accounts',
          goal: '查询往来账款',
        } as never,
        {} as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        error: true,
        message: expect.stringContaining('propose_departure_creation'),
      }),
    )
  })

  it('maps an ambiguous decision to a structured clarification', async () => {
    const tool = createConversationRoutingTool()

    await expect(
      tool.execute?.(
        {
          decision: 'request_clarification',
          prompt: '你希望新建发团，还是查询已有发团？',
          options: [
            { id: 'create', label: '新建发团' },
            { id: 'query', label: '查询发团' },
          ],
        },
        {} as never,
      ),
    ).resolves.toEqual({
      status: 'accepted',
      decision: 'request_clarification',
      interaction: {
        type: 'single_choice',
        prompt: '你希望新建发团，还是查询已有发团？',
        options: [
          { id: 'create', label: '新建发团' },
          { id: 'query', label: '查询发团' },
        ],
      },
    })
  })
})
