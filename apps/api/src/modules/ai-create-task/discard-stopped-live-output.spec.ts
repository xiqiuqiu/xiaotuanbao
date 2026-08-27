import { InMemoryAgentLiveOutput } from './agent-live-output.memory'
import { discardLiveOutputAfterUserStop } from './discard-stopped-live-output'

const snapshot = {
  attemptId: 'attempt-9',
  organizationId: 'org-1',
  conversationId: 'conversation-1',
  batchId: 'batch-1',
  generation: 3,
  revision: 2,
  reasoningText: '先核对出团日期',
  text: '已记下半段',
}

describe('discardLiveOutputAfterUserStop', () => {
  it('clears the stopped Attempt so a late snapshot cannot come back', async () => {
    const live = new InMemoryAgentLiveOutput()
    await live.publish(snapshot)

    await discardLiveOutputAfterUserStop(live, snapshot.conversationId, [
      {
        payload: {
          status: 'cancelled',
          reason: 'user_stop',
          attemptId: snapshot.attemptId,
          batchId: snapshot.batchId,
        },
      },
    ])

    expect(await live.getCurrent(snapshot.conversationId)).toBeNull()
    await live.publish({ ...snapshot, revision: 9, text: '停止后才赶到的半段' })
    expect(await live.getCurrent(snapshot.conversationId)).toBeNull()
  })

  it('clears the conversation 即时输出 when user_stop has no Attempt yet', async () => {
    const live = new InMemoryAgentLiveOutput()
    await live.publish(snapshot)

    await discardLiveOutputAfterUserStop(live, snapshot.conversationId, [
      {
        payload: {
          status: 'cancelled',
          reason: 'user_stop',
          attemptId: null,
          batchId: snapshot.batchId,
        },
      },
    ])

    expect(await live.getCurrent(snapshot.conversationId)).toBeNull()
  })

  it('does not clear a newer Attempt when the stop result has no events', async () => {
    const live = new InMemoryAgentLiveOutput()
    await live.publish({
      ...snapshot,
      attemptId: 'attempt-10',
      batchId: 'batch-2',
      generation: 4,
      text: '下一轮正在说',
    })

    await discardLiveOutputAfterUserStop(live, snapshot.conversationId, [])

    expect(await live.getCurrent(snapshot.conversationId)).toMatchObject({
      attemptId: 'attempt-10',
      text: '下一轮正在说',
    })
  })
})
