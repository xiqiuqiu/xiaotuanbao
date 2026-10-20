import { type AgentWorkItem } from '@xiaotuanbao/ai-contracts'
import { collectHeadlessRun } from './headless-execution'
import { createMastraHeadlessExecutor } from './mastra-headless.executor'
import { createWorkItemsRuntime, preservesWorkItems, type RecordedWorkItem } from './work-items.tool'

const change: AgentWorkItem = { id: 'rename', request: '团名就叫九月川西吧', goal: 'propose_change' }
const question: AgentWorkItem = { id: 'query', request: '现在团名叫什么', goal: 'answer' }
const review = { objectVersion: 2, confirmationUnit: 'basic_info_draft', candidates: [{
  fieldKey: 'routeName', proposedValue: '九月川西', clarity: 'clear',
  evidence: [{ kind: 'user_message', sequence: 1, excerpt: '团名就叫九月川西吧' }],
}] }
const record = (items: RecordedWorkItem[], id = 'record') => ({ toolName: 'recordWorkItems', toolCallId: id, result: { status: 'accepted', items } })
async function run(toolResults: unknown[], pendingItems?: AgentWorkItem[], currentUserText = '团名就叫九月川西吧', text = '', toolCalls?: unknown[]) {
  const executor = createMastraHeadlessExecutor({ readUserText: async () => currentUserText, generate: async () => ({ text, toolResults, toolCalls }) })
  return (await collectHeadlessRun(executor({
    conversationId: 'c', inputBatchId: 'b', attemptId: 'a', contextManifestId: 'm',
    executionGoal: 'resolve_items', userText: '资料包含：日期不改了', currentUserText, userTextSha256: 'a'.repeat(64), pendingItems,
  }))).result
}
describe('Agent interpreted work items', () => {
  it('rejects a rewritten restored item immediately and returns the authoritative seed for correction', async () => {
    const { tool, processor } = createWorkItemsRuntime([change])
    await expect(tool.execute?.({ items: [{ ...change, request: `${change.request}（新解释）`, resolution: { kind: 'pending' } }] }, {} as never))
      .resolves.toMatchObject({ status: 'rejected', items: [{ ...change, resolution: { kind: 'pending' } }] })
    await processor.processToolResult?.({ toolName: 'proposeReviewPackage', toolCallId: 'proposal', result: { status: 'accepted', ...review } } as never)
    await expect(tool.execute?.({ items: [{ ...change, resolution: { kind: 'awaiting_review', reviewPackageIndexes: [0] } }] }, {} as never))
      .resolves.toMatchObject({ status: 'accepted', items: [{ ...change, resolution: { kind: 'awaiting_review', reviewPackageIndexes: [0] } }] })
  })
  it('returns invalid result references to the same model run for correction', async () => {
    const { tool, processor } = createWorkItemsRuntime()
    for (const [index, prompt] of ['应收如何处理？', '应付如何处理？'].entries()) {
      await processor.processToolResult?.({ toolName: 'routeConversation', toolCallId: `route-${index}`, result: {
        status: 'accepted', decision: 'request_clarification', interaction: { type: 'free_text', prompt },
      } } as never)
    }
    const items: RecordedWorkItem[] = [
      { ...question, resolution: { kind: 'answered', message: '正式团名为川西团。' } },
      { ...change, resolution: { kind: 'awaiting_user_input', routingIndex: 0 } },
      { ...change, id: 'second', resolution: { kind: 'awaiting_user_input', routingIndex: 0 } },
    ]
    await expect(tool.execute?.({ items }, {} as never)).resolves.toMatchObject({
      status: 'rejected', issue: { code: 'ROUTING_REFERENCE_REUSED', itemId: 'second' },
      acceptedResults: { routing: [{ index: 0 }, { index: 1 }] },
    })
    items[2] = { ...items[2]!, resolution: { kind: 'awaiting_user_input', routingIndex: 1 } }
    await expect(tool.execute?.({ items }, {} as never)).resolves.toMatchObject({ status: 'accepted' })
    const abort = jest.fn()
    await processor.processOutputStep?.({ toolCalls: [], abort } as never)
    expect(abort).not.toHaveBeenCalled()
  })
  it('requests same-run model repair instead of manufacturing a clarification for unfinished work', async () => {
    const { tool, processor } = createWorkItemsRuntime([change])
    const abort = jest.fn(() => { throw new Error('retry this model step') })
    expect(() => processor.processOutputStep?.({ toolCalls: [], abort } as never)).toThrow('retry this model step')
    expect(abort).toHaveBeenCalledWith(expect.stringContaining('ITEM_UNRESOLVED'), {
      retry: true, metadata: { code: 'AGENT_OUTCOME_INCOMPLETE' },
    })
    await processor.processToolResult?.({ toolName: 'proposeReviewPackage', toolCallId: 'proposal', result: { status: 'accepted', ...review } } as never)
    await tool.execute?.({ items: [{ ...change, resolution: { kind: 'awaiting_review', reviewPackageIndexes: [0] } }] }, {} as never)
    abort.mockClear()
    await processor.processOutputStep?.({ toolCalls: [], abort } as never)
    expect(abort).not.toHaveBeenCalled()
  })
  it('requires an item ledger instead of accepting conversational completion', async () => {
    expect((await run([])).kind).toBe('failed')
  })
  it('does not invent a user clarification when the model stops before resolving a complete request', async () => {
    const result = await run([
      record([{ ...change, resolution: { kind: 'pending' } }], 'first'),
      { toolName: 'searchPartners', toolCallId: 'search', result: { status: 'accepted', matches: [] } },
    ])
    expect(result).toMatchObject({ kind: 'failed', error: { code: 'AGENT_OUTCOME_INCOMPLETE' } })
    expect(JSON.stringify(result)).not.toContain('补充缺少的信息')
  })
  it('preserves the actual public answer instead of replacing it with a work progress receipt', async () => {
    const answer = '先创建发团并核对日期。然后录入客源与执行资源。最后核对正式来源并提交应收应付。'
    const result = await run([
      record([{ ...question, resolution: { kind: 'answered', message: '已用三句话说明操作步骤。' } }]),
    ], undefined, '请用三句话解释业务步骤', answer)
    expect(result).toMatchObject({ kind: 'resolved_items', publicAnswer: answer, message: answer })
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
  it('preserves completed read-only answers when a separate action has invalid result references', async () => {
    const answer = { ...question, goal: 'answer' as const, resolution: { kind: 'answered' as const, message: '当前正式团名为川西团。' } }
    const result = await run([record([
      answer,
      { ...change, resolution: { kind: 'awaiting_user_input', routingIndex: 9 } },
    ])])
    expect(result).toMatchObject({ kind: 'failed', completedAnswers: [answer], diagnostic: {
      outcomeIssue: { code: 'ROUTING_REFERENCE_MISSING', itemId: change.id },
    } })
    expect(JSON.stringify(result)).not.toContain('awaiting_review')
  })
  it.each(['succeeded', 'failed', 'denied'])('retains a completed answer after ledger rejection only when the business read %s', async status => {
    const answer = { ...question, goal: 'answer' as const, resolution: { kind: 'answered' as const, message: '当前正式团名为川西团。' } }
    const result = await run([
      { toolName: 'getTaskContext', toolCallId: 'read', ...(status === 'failed' ? { isError: true } : {}), result: { status, snapshot: {} } },
      record([answer, { ...change, resolution: { kind: 'pending' } }]),
      { toolName: 'recordWorkItems', toolCallId: 'invalid', result: { status: 'rejected', issue: { code: 'ROUTING_REFERENCE_MISSING' } } },
    ], undefined, undefined, '', [
      { toolName: 'getTaskContext', toolCallId: 'read' },
      { toolName: 'recordWorkItems', toolCallId: 'record' },
      { toolName: 'recordWorkItems', toolCallId: 'invalid' },
    ])
    expect(result.kind).toBe('failed')
    if (status === 'succeeded') expect(result).toMatchObject({ completedAnswers: [answer] })
    else expect(result).not.toHaveProperty('completedAnswers')
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
