import {
  AI_CREATE_AGENT_DEFINITION,
  AI_CREATE_CAPABILITY_DEFINITIONS,
  agentDefinitionRegistry,
  capabilityDefinitionRegistry,
} from './agent-definition'

describe('现有建团 Agent Definition', () => {
  it('同时登记通用无任务会话 Definition', () => {
    expect(agentDefinitionRegistry.get({ key: 'conversation.general', version: 1 }).key).toBe(
      'conversation.general',
    )
    expect(
      capabilityDefinitionRegistry.get({ key: 'conversation.plaintext.reply', version: 1 }).toolName,
    ).toBe('replyPlaintext')
  })

  it('登记稳定 Agent/Capability 版本及工具输入、输出、上下文 Schema', () => {
    expect(agentDefinitionRegistry.get({ key: 'departure.create', version: 1 })).toBe(
      AI_CREATE_AGENT_DEFINITION,
    )
    expect(
      AI_CREATE_CAPABILITY_DEFINITIONS.map(({ key, version, toolName }) => ({
        key,
        version,
        toolName,
      })),
    ).toEqual([
      { key: 'departure.task-context.read', version: 2, toolName: 'getTaskContext' },
      { key: 'departure.route-template.search', version: 1, toolName: 'searchRouteTemplates' },
      { key: 'departure.review-package.propose', version: 1, toolName: 'submitReviewPackage' },
      { key: 'departure.material-parse-result.read', version: 1, toolName: 'getMaterialParseResult' },
    ])
    for (const capability of AI_CREATE_CAPABILITY_DEFINITIONS) {
      expect(capabilityDefinitionRegistry.get(capability)).toBe(capability)
      expect(capability.inputSchema).toBeDefined()
      expect(capability.outputSchema).toBeDefined()
      expect(capability.contextSchema).toBeDefined()
    }
  })
})
