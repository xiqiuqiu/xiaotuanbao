import { AiAgentAttemptStatus } from '@prisma/client'
import {
  canCommitAttemptTerminal,
  notifyCommittedConversationEvents,
} from './attempt-terminal-commit'

describe('canCommitAttemptTerminal #418', () => {
  it('allows a running Attempt that still owns the job generation', () => {
    expect(
      canCommitAttemptTerminal(
        { status: AiAgentAttemptStatus.running, generation: 4 },
        4,
      ),
    ).toBe(true)
  })

  it('refuses a second terminal commit after the Attempt already completed', () => {
    expect(
      canCommitAttemptTerminal(
        { status: AiAgentAttemptStatus.completed, generation: 4 },
        4,
      ),
    ).toBe(false)
  })

  it('refuses a stale generation after the lease was taken over', () => {
    expect(
      canCommitAttemptTerminal(
        { status: AiAgentAttemptStatus.running, generation: 3 },
        4,
      ),
    ).toBe(false)
  })
})

describe('notifyCommittedConversationEvents #418', () => {
  it('does not throw when live relay publish fails after the terminal commit', async () => {
    const faults: unknown[] = []
    await expect(
      notifyCommittedConversationEvents(
        async () => {
          throw new Error('SSE notify failed')
        },
        (error) => {
          faults.push(error)
        },
      ),
    ).resolves.toBeUndefined()
    expect(faults).toHaveLength(1)
  })
})
