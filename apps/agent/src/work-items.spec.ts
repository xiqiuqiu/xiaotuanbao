import { type AgentWorkItem } from '@xiaotuanbao/ai-contracts'
import { collectHeadlessRun } from './headless-execution'
import { createMastraHeadlessExecutor } from './mastra-headless.executor'
import { createRecordWorkItemsTool, preservesWorkItems, type RecordedWorkItem } from './work-items.tool'

const change: AgentWorkItem = { id: 'rename', request: '团名就叫九月川西吧', goal: 'propose_change' }
const question: AgentWorkItem = { id: 'query', request: '现在团名叫什么', goal: 'answer' }
const review = { objectVersion: 2, confirmationUnit: 'basic_info_draft', candidates: [{
  fieldKey: 'routeName', proposedValue: '九月川西', clarity: 'clear',
  evidence: [{ kind: 'user_message', sequence: 1, excerpt: '团名就叫九月川西吧' }],
}] }
const record = (items: RecordedWorkItem[], id = 'record') => ({ toolName: 'recordWorkItems', toolCallId: id, result: { status: 'accepted', items } })
async function run(toolResults: unknown[], pendingItems?: AgentWorkItem[], currentUserText = '团名就叫九月川西吧') {
  const executor = createMastraHeadlessExecutor({ readUserText: async () => currentUserText, generate: async () => ({ text: '全部完成', toolResults }) })
  return (await collectHeadlessRun(executor({
    conversationId: 'c', inputBatchId: 'b', attemptId: 'a', contextManifestId: 'm',
    executionGoal: 'resolve_items', userText: '资料包含：日期不改了', currentUserText, userTextSha256: 'a'.repeat(64), pendingItems,
  }))).result
}
describe('Agent interpreted work items', () => {
  it('rejects a rewritten restored item immediately and returns the authoritative seed for correction', async () => {
    const tool = createRecordWorkItemsTool([change])
    await expect(tool.execute?.({ items: [{ ...change, request: `${change.request}（新解释）`, resolution: { kind: 'pending' } }] }, {} as never))
      .resolves.toMatchObject({ status: 'rejected', items: [{ ...change, resolution: { kind: 'pending' } }] })
    await expect(tool.execute?.({ items: [{ ...change, resolution: { kind: 'awaiting_review', reviewPackageIndexes: [0] } }] }, {} as never))
      .resolves.toMatchObject({ status: 'accepted', items: [{ ...change, resolution: { kind: 'awaiting_review', reviewPackageIndexes: [0] } }] })
  })
  it('requires an item ledger instead of accepting conversational completion', async () => {
    expect((await run([])).kind).toBe('failed')
  })
  it('rejects answering an already identified change or deleting it across a continuation', async () => {
    expect(preservesWorkItems([change], [{ ...change, goal: 'answer' }])).toBe(false)
    expect((await run([record([{ ...question, resolution: { kind: 'answered', message: '旧团名' } }])], [change])).kind).toBe('failed')
    expect((await run([record([{ ...change, resolution: { kind: 'answered', message: '已改' } }])])).kind).toBe('failed')
  })
  it('retains queries, multiple reviews and clarification together, linked to actual tools', async () => {
    const result = await run([
      { toolName: 'proposeReviewPackage', toolCallId: 'p1', result: { status: 'accepted', ...review } },
      { toolName: 'proposeReviewPackage', toolCallId: 'p2', result: { status: 'accepted', ...review } },
      { toolName: 'routeConversation', toolCallId: 'r1', result: { status: 'accepted', decision: 'request_clarification', interaction: { type: 'free_text', prompt: '顺延几天？' } } },
      record([
        { ...question, resolution: { kind: 'answered', message: '旧团名' } },
        { ...change, resolution: { kind: 'awaiting_review', reviewPackageIndexes: [0, 1] } },
        { id: 'date', request: '日期顺延一下', goal: 'propose_change', resolution: { kind: 'awaiting_user_input', routingIndex: 0 } },
      ]),
    ])
    expect(result.kind).toBe('resolved_items')
    if (result.kind !== 'resolved_items') throw new Error('expected resolved_items')
    expect(result.items).toHaveLength(3)
    expect(result.reviewPackages).toHaveLength(2)
    expect(result.message).toContain('顺延几天？')
    expect(result.message).not.toContain('全部完成')
  })
  it.each([false, true])('rejects reusing an accepted review index (across items: %s)', async acrossItems => {
    const items: RecordedWorkItem[] = acrossItems
      ? [
        { ...change, resolution: { kind: 'awaiting_review', reviewPackageIndexes: [0] } },
        { ...change, id: 'other', resolution: { kind: 'awaiting_review', reviewPackageIndexes: [0] } },
      ]
      : [{ ...change, resolution: { kind: 'awaiting_review', reviewPackageIndexes: [0, 0] } }]
    expect((await run([
      { toolName: 'proposeReviewPackage', toolCallId: 'p1', result: { status: 'accepted', ...review } },
      record(items),
    ])).kind).toBe('failed')
  })
  it('rejects reusing a clarification result for a different work item', async () => {
    expect((await run([
      { toolName: 'routeConversation', toolCallId: 'r1', result: { status: 'accepted', decision: 'request_clarification', interaction: { type: 'free_text', prompt: '顺延几天？' } } },
      record([
        { ...change, resolution: { kind: 'awaiting_user_input', routingIndex: 0 } },
        { ...change, id: 'other', resolution: { kind: 'awaiting_user_input', routingIndex: 0 } },
      ]),
    ])).kind).toBe('failed')
  })
  it('passes the budgeted input to the model without appending pending items', async () => {
    const generate = jest.fn(async () => ({ text: 'no completion' }))
    const executor = createMastraHeadlessExecutor({ readUserText: async () => 'already budgeted context', generate })
    await collectHeadlessRun(executor({
      conversationId: 'c', inputBatchId: 'b', attemptId: 'a', contextManifestId: 'm',
      executionGoal: 'resolve_items', userText: 'already budgeted context', userTextSha256: 'a'.repeat(64), pendingItems: [change],
    }))
    expect(generate).toHaveBeenCalledWith('already budgeted context')
  })
  it('does not accept fabricated review or clarification references', async () => {
    expect((await run([record([{ ...change, resolution: { kind: 'awaiting_review', reviewPackageIndexes: [0] } }])])).kind).toBe('failed')
    expect((await run([record([{ ...change, resolution: { kind: 'awaiting_user_input', routingIndex: 0 } }])])).kind).toBe('failed')
  })
  it('accepts withdrawal only with an excerpt from current user input, never source material', async () => {
    const result = record([{ ...change, resolution: { kind: 'withdrawn', userExcerpt: '日期不改了' } }])
    expect((await run([result])).kind).toBe('failed')
    expect((await run([result], [change], '日期不改了')).kind).toBe('resolved_items')
  })
  it('keeps snapshot history from silently downgrading declared changes', async () => {
    expect((await run([
      record([{ ...change, resolution: { kind: 'pending' } }], 'first'),
      record([{ ...change, goal: 'answer', resolution: { kind: 'answered', message: 'done' } }], 'second'),
    ])).kind).toBe('failed')
  })
})
