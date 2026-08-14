import {
  GET_MATERIAL_PARSE_RESULT_TOOL,
  getMaterialParseResultInputSchema,
  getMaterialParseResultOutputSchema,
} from './get-material-parse-result'

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

  it('accepts an optional pageNumber for directed evidence reads', () => {
    expect(
      getMaterialParseResultInputSchema.parse({
        taskId: 'task-1',
        runId: 'run-1',
        materialId: 'mat-1',
        parseResultVersion: 1,
        pageNumber: 2,
      }),
    ).toEqual({
      taskId: 'task-1',
      runId: 'run-1',
      materialId: 'mat-1',
      parseResultVersion: 1,
      pageNumber: 2,
    })
  })

  it('returns pageCount and truncated so callers can fetch remaining pages on demand', () => {
    expect(
      getMaterialParseResultOutputSchema.parse({
        materialId: 'mat-1',
        parseResultVersion: 1,
        pageCount: 2,
        truncated: true,
        pages: [],
        bytes: 'must-not-pass',
      }),
    ).toEqual({
      materialId: 'mat-1',
      parseResultVersion: 1,
      pageCount: 2,
      truncated: true,
      pages: [],
    })
  })
})
