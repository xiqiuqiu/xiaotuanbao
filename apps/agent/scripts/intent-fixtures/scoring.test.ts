import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scoreIntent } from './cases'

test('mixed requests cannot pass by answering only; unnecessary clarification is counted', () => {
  assert.equal(scoreIntent(['answered', 'awaiting_review'], [{ resolution: { kind: 'answered' } }]).passed, false)
  assert.equal(scoreIntent(['answered'], [{ resolution: { kind: 'awaiting_user_input' } }]).extraClarifications, 1)
  assert.equal(scoreIntent(['awaiting_review', 'answered'], [
    { resolution: { kind: 'answered' } }, { resolution: { kind: 'awaiting_review' } },
  ]).passed, true)
})
