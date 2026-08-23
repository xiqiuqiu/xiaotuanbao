export type MockConversation = {
  id: string
  title: string
  preview: string
  age: string
  group: '今天' | '昨天' | '最近 7 天' | '更早'
  status?: '进行中' | '待审核' | '已完成'
}

export const MOCK_CONVERSATIONS: MockConversation[] = [
  {
    id: 'conv-departure',
    title: '录入 9 月 6 日川西小团',
    preview: '客源单还差联系人手机号，等待补充',
    age: '12 分钟',
    group: '今天',
    status: '进行中',
  },
  {
    id: 'conv-finance',
    title: '核对八月应收与到账情况',
    preview: '已找到 3 条未核销流水',
    age: '昨天',
    group: '昨天',
    status: '待审核',
  },
  {
    id: 'conv-supplier',
    title: '查询九寨沟供应商结算',
    preview: '整理了酒店与车队的待付款节点',
    age: '4 天',
    group: '最近 7 天',
    status: '已完成',
  },
  {
    id: 'conv-old',
    title: '整理春节团期的客源名单',
    preview: '已完成 6 个团的名单检查',
    age: '92 天',
    group: '更早',
    status: '已完成',
  },
]

export const PROTOTYPE_VARIANTS = [
  { key: 'A', label: '轻盈会话' },
  { key: 'B', label: '高效工作台' },
  { key: 'C', label: '任务推进台' },
] as const

export type PrototypeVariant = (typeof PROTOTYPE_VARIANTS)[number]['key']
export type PrototypeMode = 'side' | 'global'
