import { AiCollaborationError, aiCollaborationErrorSchema } from './ai-collaboration-error'

describe('AI collaboration structured errors', () => {
  it.each([
    ['AGENT_UNAVAILABLE', 'AI 辅助暂时不可用，请稍后重试或继续使用表单'],
    ['MODEL_TIMEOUT', '模型响应超时，已保存的发团创建草稿未改动'],
    ['MODEL_REFUSED', '模型拒绝回答，请换一种说法或继续使用表单'],
    ['INVALID_FORMAT', '模型输出格式异常，本轮未形成任何候选'],
    ['PERMISSION_DENIED', '当前账号无权使用 AI 建团辅助'],
    ['DELEGATION_INVALID', 'AI 操作委托无效或已过期，请重新打开侧栏'],
    ['SERVICE_IDENTITY_INVALID', '不受信任的 AI 编排服务'],
    ['VERSION_CONFLICT', '草稿版本已变化，请重新读取任务上下文后再提交候选'],
    ['REVIEW_PENDING', '已有待确认审核包，请先在表单拒绝或确认后再提交新候选'],
    ['CONTEXT_CAPACITY_EXCEEDED', '上下文超出容量上限，请拆分或精简后再试'],
  ] as const)('maps %s to a stable user-facing message', (code, message) => {
    const error = AiCollaborationError.fromCode(code)
    expect(error.code).toBe(code)
    expect(error.message).toBe(message)
    expect(aiCollaborationErrorSchema.parse(error.toJSON())).toEqual({
      code,
      message,
      retryable:
        code === 'AGENT_UNAVAILABLE' ||
        code === 'MODEL_TIMEOUT' ||
        code === 'VERSION_CONFLICT' ||
        code === 'CONTEXT_CAPACITY_EXCEEDED',
    })
  })
})
