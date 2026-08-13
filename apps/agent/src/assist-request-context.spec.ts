import { getAssistRequestContext, runWithAssistRequestContext } from './assist-request-context'

describe('assist request context', () => {
  it('returns the values written for the current async context', async () => {
    const seen = await runWithAssistRequestContext(
      { delegationToken: 'deleg-1', taskId: 'task-1', runId: 'run-1' },
      () => getAssistRequestContext(),
    )

    expect(seen).toEqual({
      delegationToken: 'deleg-1',
      taskId: 'task-1',
      runId: 'run-1',
    })
  })

  it('keeps the store visible to an awaited inner async function', async () => {
    const seen = await runWithAssistRequestContext(
      { delegationToken: 'deleg-1', taskId: 'task-1', runId: 'run-1' },
      async () => {
        await Promise.resolve()
        await new Promise<void>((resolve) => {
          setImmediate(resolve)
        })
        return getAssistRequestContext()
      },
    )

    expect(seen).toEqual({
      delegationToken: 'deleg-1',
      taskId: 'task-1',
      runId: 'run-1',
    })
  })

  it('throws when read outside a request context', () => {
    expect(() => getAssistRequestContext()).toThrow()
  })
})
