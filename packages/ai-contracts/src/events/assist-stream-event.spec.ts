import { AiCollaborationError } from '../errors/ai-collaboration-error'
import { assistStreamEventSchema } from './assist-stream-event'

describe('assist stream events', () => {
  it('describes running, token deltas, completion and structured failure', () => {
    expect(assistStreamEventSchema.parse({ type: 'run.started', runStatus: 'running' })).toEqual({
      type: 'run.started',
      runStatus: 'running',
    })
    expect(assistStreamEventSchema.parse({ type: 'message.delta', text: '团名已填写' })).toEqual({
      type: 'message.delta',
      text: '团名已填写',
    })
    expect(assistStreamEventSchema.parse({ type: 'run.completed', runStatus: 'completed' })).toEqual({
      type: 'run.completed',
      runStatus: 'completed',
    })

    const error = AiCollaborationError.fromCode('AGENT_UNAVAILABLE')
    expect(
      assistStreamEventSchema.parse({
        type: 'run.failed',
        runStatus: 'failed',
        error: error.toJSON(),
      }),
    ).toMatchObject({
      type: 'run.failed',
      error: { code: 'AGENT_UNAVAILABLE', retryable: true },
    })
  })
})
