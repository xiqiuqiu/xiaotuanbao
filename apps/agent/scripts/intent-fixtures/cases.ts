import type { AgentWorkItem } from '@xiaotuanbao/ai-contracts'

export interface IntentFixture {
  id: string
  definition?: 'general' | 'collaboration'
  text: string
  expected: string[]
  expectedName?: string
  history?: string
  pendingItems?: AgentWorkItem[]
}

export const intentCases: IntentFixture[] = [
  { id: 'synonym.replace', text: '能把团名换成九月川西吗？', expected: ['awaiting_review'], expectedName: '九月川西' },
  { id: 'synonym.implicit', text: '团名就叫九月川西吧。', expected: ['awaiting_review'], expectedName: '九月川西' },
  { id: 'negation', text: '不要修改，只告诉我现在的出发日期。', expected: ['answered'] },
  { id: 'howto', text: '如何修改出发日？我只想了解操作方法。', expected: ['answered'] },
  { id: 'howto.short', text: '如何修改出发日？', expected: ['answered'] },
  { id: 'ellipsis', history: '用户：我想把团名改为九月川西。\n助手：好的，请确认新的团名。', text: '就用刚才那个名字。', expected: ['awaiting_review'], expectedName: '九月川西' },
  { id: 'mixed', text: '告诉我现在的出发日期；团名改为九月川西；另外把日期改一下。', expected: ['answered', 'awaiting_review', 'awaiting_user_input'], expectedName: '九月川西' },
  { id: 'ambiguous', text: '把日期改一下。', expected: ['awaiting_user_input'] },
]

export const extendedIntentCases: IntentFixture[] = [
  { id: 'general.howto', definition: 'general', text: '如何修改出发日？我只问操作方法。', expected: ['answered'] },
  { id: 'general.negation', definition: 'general', text: '不要创建或修改发团，只告诉我“出发日期”是什么意思。', expected: ['answered'] },
  { id: 'general.short-howto', definition: 'general', text: '如何修改出发日？', expected: ['answered'] },
  { id: 'collaboration.query', definition: 'collaboration', text: '当前团的出发日期是哪天？', expected: ['answered'] },
  { id: 'collaboration.negation', definition: 'collaboration', text: '不要修改任何内容，只告诉我团名。', expected: ['answered'] },
  { id: 'collaboration.ambiguous', definition: 'collaboration', text: '把酒店调整一下。', expected: ['awaiting_user_input'] },
  { id: 'recovery.answer', text: '新团名用九月川西。', expected: ['awaiting_review'], expectedName: '九月川西',
    pendingItems: [{ id: 'rename-original', request: '把团名改一下', goal: 'propose_change' }] },
  { id: 'recovery.withdrawn', text: '撤销之前修改团名的请求，这一项不做了。', expected: ['withdrawn'],
    pendingItems: [{ id: 'rename-original', request: '把团名改一下', goal: 'propose_change' }] },
]

export function scoreIntent(expected: readonly string[], items: readonly { resolution: { kind: string } }[]) {
  const actual = items.map((item) => item.resolution.kind).sort()
  const desired = [...expected].sort()
  const extraClarifications = Math.max(0,
    actual.filter((kind) => kind === 'awaiting_user_input').length
      - desired.filter((kind) => kind === 'awaiting_user_input').length)
  return { passed: JSON.stringify(actual) === JSON.stringify(desired), actual, extraClarifications }
}
