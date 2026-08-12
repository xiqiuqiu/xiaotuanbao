/** PROTOTYPE mock — AI 辅助新建发团的双模式交互探索。 */

export type CreateMode = 'form' | 'ai'

export const AI_CREATE_VARIANTS = [
  { key: 'A', label: '表单主场 + AI 侧栏' },
  { key: 'B', label: 'AI 主场 + 实时草稿' },
  { key: 'C', label: '阶段任务台 + 审核门' },
  { key: 'D', label: '定稿：A 主场 + C 审核' },
] as const

export type AiCreateVariantKey = (typeof AI_CREATE_VARIANTS)[number]['key']

export const STAGES = [
  { key: 'base', title: '发团信息', status: 'process' },
  { key: 'source', title: '客源单', status: 'wait' },
  { key: 'itinerary', title: '行程安排', status: 'wait' },
  { key: 'resource', title: '资源与应付', status: 'wait' },
  { key: 'finish', title: '完成检查', status: 'wait' },
] as const

export const DRAFT_FIELDS = [
  { label: '线路名称', value: '北疆经典 8 日', status: '待确认', source: 'AI 推荐' },
  { label: '出团日期', value: '2026-08-20', status: '已确认', source: '用户回答' },
  { label: '结束日期', value: '2026-08-27', status: '待确认', source: '系统计算' },
  { label: '预计人数', value: '22 人', status: '参考', source: '用户回答' },
] as const

export const CHAT_MESSAGES = [
  { role: 'assistant', text: '这次准备创建什么线路的发团？' },
  { role: 'user', text: '8 月 20 日出发的北疆 8 日团，大概 22 人。' },
  {
    role: 'assistant',
    text: '已记录日期、天数和预计人数。我找到一条使用过 16 次的相似路线，请先核对右侧候选结果。',
  },
] as const
