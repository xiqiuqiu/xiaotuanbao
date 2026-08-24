import {
  AI_CREATE_SYSTEM_INSTRUCTIONS,
  aiCreateModelContractForTools,
} from './ai-create-model-contract'

describe('AI 建团模型输入契约', () => {
  it('以稳定顺序投影实际可见工具及其输入 Schema', () => {
    const left = aiCreateModelContractForTools([
      'submitReviewPackage',
      'getTaskContext',
    ])
    const right = aiCreateModelContractForTools([
      'getTaskContext',
      'submitReviewPackage',
    ])

    expect(left.toolSchemaText).toBe(right.toolSchemaText)
    expect(JSON.parse(left.toolSchemaText)).toMatchObject([
      { name: 'getTaskContext' },
      { name: 'submitReviewPackage' },
    ])
    expect(left.toolNames).toEqual(['getTaskContext', 'submitReviewPackage'])
    expect(AI_CREATE_SYSTEM_INSTRUCTIONS).toContain('必须先调用 getTaskContext')
  })

  it('拒绝未注册工具，避免 Manifest 预算与模型可见 Schema 分叉', () => {
    expect(() => aiCreateModelContractForTools(['unknownTool'])).toThrow('未注册')
  })
})
