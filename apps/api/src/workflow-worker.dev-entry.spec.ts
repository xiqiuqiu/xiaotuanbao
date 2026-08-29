import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('dev workflow worker entry', () => {
  it('points at nest dist/workflow-worker.main.js, not dist/src', () => {
    const script = readFileSync(resolve(__dirname, '../scripts/dev-workflow-worker.js'), 'utf8')
    expect(script).toContain("../dist/workflow-worker.main.js")
    expect(script).not.toContain('../dist/src/workflow-worker.main.js')
  })
})
