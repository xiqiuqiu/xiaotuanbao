import { z } from 'zod'

export const AI_COLLABORATION_ERROR_CODES = [
  'AGENT_UNAVAILABLE',
  'MODEL_TIMEOUT',
  'MODEL_REFUSED',
  'INVALID_FORMAT',
  'PERMISSION_DENIED',
  'DELEGATION_INVALID',
  'SERVICE_IDENTITY_INVALID',
  'VERSION_CONFLICT',
  'REVIEW_PENDING',
] as const

export type AiCollaborationErrorCode = (typeof AI_COLLABORATION_ERROR_CODES)[number]

const MESSAGES: Record<AiCollaborationErrorCode, string> = {
  AGENT_UNAVAILABLE: 'AI 辅助暂时不可用，请稍后重试或继续使用表单',
  MODEL_TIMEOUT: '模型响应超时，已保存的发团创建草稿未改动',
  MODEL_REFUSED: '模型拒绝回答，请换一种说法或继续使用表单',
  INVALID_FORMAT: '模型输出格式异常，本轮未形成任何候选',
  PERMISSION_DENIED: '当前账号无权使用 AI 建团辅助',
  DELEGATION_INVALID: 'AI 操作委托无效或已过期，请重新打开侧栏',
  SERVICE_IDENTITY_INVALID: '不受信任的 AI 编排服务',
  VERSION_CONFLICT: '草稿版本已变化，请重新读取任务上下文后再提交候选',
  REVIEW_PENDING: '已有待确认审核包，请先在表单拒绝或确认后再提交新候选',
}

const RETRYABLE: ReadonlySet<AiCollaborationErrorCode> = new Set([
  'AGENT_UNAVAILABLE',
  'MODEL_TIMEOUT',
  'VERSION_CONFLICT',
])

export const aiCollaborationErrorSchema = z
  .object({
    code: z.enum(AI_COLLABORATION_ERROR_CODES),
    message: z.string().min(1),
    retryable: z.boolean(),
  })
  .strip()

export type AiCollaborationErrorJson = z.infer<typeof aiCollaborationErrorSchema>

export class AiCollaborationError extends Error {
  readonly code: AiCollaborationErrorCode
  readonly retryable: boolean

  constructor(code: AiCollaborationErrorCode, message = MESSAGES[code]) {
    super(message)
    this.name = 'AiCollaborationError'
    this.code = code
    this.retryable = RETRYABLE.has(code)
  }

  static fromCode(code: AiCollaborationErrorCode): AiCollaborationError {
    return new AiCollaborationError(code)
  }

  toJSON(): AiCollaborationErrorJson {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    }
  }
}
