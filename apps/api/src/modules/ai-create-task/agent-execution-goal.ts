import {
  AI_CREATE_AGENT_DEFINITION_REF,
  CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
  DEPARTURE_COLLABORATION_AGENT_DEFINITION_REF,
  agentExecutionGoalSchema,
  type AgentExecutionGoal,
} from '@xiaotuanbao/ai-contracts'
import type { AgentExecutionRoute } from './agent-execution-router'

export function executionGoalForRoute(input: {
  route: AgentExecutionRoute
  executionGoal?: AgentExecutionGoal
  userText?: string
}): AgentExecutionGoal {
  if (input.executionGoal) {
    return agentExecutionGoalSchema.parse(input.executionGoal)
  }
  if (input.route.kind === 'persistent_follow_up') {
    return 'clarify'
  }
  if (input.route.kind === 'task_creation_proposal') {
    return 'governed_action'
  }
  const key = input.route.agentDefinition.key
  if (key === AI_CREATE_AGENT_DEFINITION_REF.key) {
    return 'propose_change'
  }
  if (key === DEPARTURE_COLLABORATION_AGENT_DEFINITION_REF.key) {
    return isClearlyReadOnlyQuestion(input.userText) ? 'answer' : 'propose_change'
  }
  if (key === CONVERSATION_GENERAL_AGENT_DEFINITION_REF.key) {
    return 'answer'
  }
  return 'answer'
}

function isClearlyReadOnlyQuestion(userText?: string): boolean {
  if (
    !userText ||
    /(?:改|更新|新增|添加|创建|删除|移除|调整|录入|导入|提交|生成|设置|变更|取消|作废|确认)/u.test(userText)
  ) {
    return false
  }
  // ponytail: 明确查询才放宽；需要更广语义时再换成可审计的意图分类。
  return /[?？]|(?:什么|多少|几个|是否|有没有|哪|如何|怎么|查询|查看|显示|告诉我)/u.test(userText)
}
