import { GET_MATERIAL_PARSE_RESULT_TOOL, getMaterialParseResultInputSchema } from './get-material-parse-result'

describe('getMaterialParseResult contract v1', () => {
  it('declares the versioned tool name and requires a pinned parse version', () => {
    expect(GET_MATERIAL_PARSE_RESULT_TOOL).toEqual({
      name: 'getMaterialParseResult',
      version: 1,
    })
    expect(
      getMaterialParseResultInputSchema.parse({
        taskId: 'task-1',
        runId: 'run-1',
        materialId: 'mat-1',
        parseResultVersion: 1,
        bytes: 'must-not-pass',
      }),
    ).toEqual({
      taskId: 'task-1',
      runId: 'run-1',
      materialId: 'mat-1',
      parseResultVersion: 1,
    })
  })
})
