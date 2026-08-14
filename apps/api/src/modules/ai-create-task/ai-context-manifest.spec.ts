import {
  parseEventSequences,
  projectConversationEventsForAgent,
} from './ai-context-manifest'

describe('projectConversationEventsForAgent', () => {
  it('projects pinned User plaintext and drops unknown event kinds', () => {
    expect(
      projectConversationEventsForAgent([
        { sequence: 1, kind: 'user_message', payload: { text: '  帮我建一个喀纳斯3日团  ' } },
        { sequence: 2, kind: 'batch_status', payload: { batchId: 'batch-1', status: 'agent_running' } },
        { sequence: 3, kind: 'hidden_reasoning', payload: { text: 'should not leak' } },
      ]),
    ).toEqual([
      { sequence: 1, kind: 'user_message', text: '帮我建一个喀纳斯3日团' },
      { sequence: 2, kind: 'batch_status' },
    ])
  })

  it('reads integer event sequences from the ContextManifest JSON', () => {
    expect(parseEventSequences([1, 2, '3', 0, -1, 4.5, 3])).toEqual([1, 2, 3])
    expect(parseEventSequences({ sequences: [1] })).toEqual([])
  })
})
