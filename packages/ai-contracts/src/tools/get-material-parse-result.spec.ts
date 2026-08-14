import {
  GET_MATERIAL_PARSE_RESULT_TOOL,
  getMaterialParseResultInputSchema,
  getMaterialParseResultOutputSchema,
} from './get-material-parse-result'

describe('getMaterialParseResult contract v1', () => {
  it('declares the versioned tool name', () => {
    expect(GET_MATERIAL_PARSE_RESULT_TOOL).toEqual({
      name: 'getMaterialParseResult',
      version: 1,
    })
  })

  it('accepts only task, run and material identifiers', () => {
    const parsed = getMaterialParseResultInputSchema.parse({
      taskId: 'task-1',
      runId: 'run-1',
      materialId: 'mat-1',
      organizationId: 'should-be-stripped',
    })
    expect(parsed).toEqual({ taskId: 'task-1', runId: 'run-1', materialId: 'mat-1' })
  })

  it('returns pages without leaking parser internals', () => {
    const parsed = getMaterialParseResultOutputSchema.parse({
      materialId: 'mat-1',
      status: 'available',
      resultVersion: 1,
      pages: [
        {
          pageNumber: 1,
          source: 'native_pdf',
          text: '八月川西团',
          markdown: '# 八月川西团',
          boxes: 'should-be-stripped',
        },
      ],
    })
    expect(parsed.pages[0]).toEqual({
      pageNumber: 1,
      source: 'native_pdf',
      text: '八月川西团',
      markdown: '# 八月川西团',
    })
  })
})
