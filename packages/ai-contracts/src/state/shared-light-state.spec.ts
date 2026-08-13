import { aiCreateSharedLightStateSchema } from './shared-light-state'

describe('CopilotKit shared light state', () => {
  it('keeps only task, stage, run, review, snapshot version and progress', () => {
    const parsed = aiCreateSharedLightStateSchema.parse({
      taskId: 'task-1',
      stageKey: 'basic_info',
      runStatus: 'running',
      reviewPackageId: null,
      snapshotVersion: 2,
      progress: 'collecting',
      draftSnapshot: { name: 'should not leak' },
      messages: ['chat must not become business fact'],
    })

    expect(parsed).toEqual({
      taskId: 'task-1',
      stageKey: 'basic_info',
      runStatus: 'running',
      reviewPackageId: null,
      snapshotVersion: 2,
      progress: 'collecting',
    })
  })
})
