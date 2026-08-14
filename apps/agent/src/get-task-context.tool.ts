import { AiCollaborationError } from '@xiaotuanbao/ai-contracts'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { getAssistRequestContext } from './assist-request-context'
import { fetchTaskContext } from './get-task-context.client'

export interface GetTaskContextToolConfig {
  apiBaseUrl: string
  serviceSecret: string
  modelApiKey?: string
}

export function createGetTaskContextTool(config: GetTaskContextToolConfig) {
  return createTool({
    id: 'getTaskContext',
    description:
      '读取当前 AI 建团任务的业务快照、字段覆盖、钉定会话事件，以及已解析完成的资料事实索引（materials[].status 恒为 ready，含 pageCount 与摘录，不是全文）。不改写发团创建草稿。',
    inputSchema: z.object({}),
    execute: async () => {
      if (!config.modelApiKey?.trim()) {
        throw AiCollaborationError.fromCode('AGENT_UNAVAILABLE')
      }

      const { delegationToken, taskId, runId } = getAssistRequestContext()
      return fetchTaskContext(
        {
          apiBaseUrl: config.apiBaseUrl,
          serviceSecret: config.serviceSecret,
          delegationToken,
        },
        { taskId, runId },
      )
    },
  })
}
