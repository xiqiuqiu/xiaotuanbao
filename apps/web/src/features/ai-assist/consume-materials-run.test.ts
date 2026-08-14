import { describe, expect, it } from 'vitest'
import { canStartConsumeRun } from './consume-materials-run'

describe('canStartConsumeRun', () => {
  it('does not start a second run while the thread is already running', () => {
    expect(
      canStartConsumeRun({
        consumeKey: 'mat-1:1',
        firstTurnSent: true,
        alreadySent: false,
        isRunning: true,
      }),
    ).toBe(false)
  })

  it('starts an idle follow-up after parse results become ready', () => {
    expect(
      canStartConsumeRun({
        consumeKey: 'mat-1:1',
        firstTurnSent: true,
        alreadySent: false,
        isRunning: false,
      }),
    ).toBe(true)
  })
})
