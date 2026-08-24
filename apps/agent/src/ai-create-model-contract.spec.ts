import { standardSchemaToJSONSchema } from '@mastra/core/schema'
import {
  AI_CREATE_TOOL_NAMES,
  aiCreateModelContractForTools,
} from '@xiaotuanbao/ai-contracts'
import { createGetMaterialParseResultTool } from './get-material-parse-result.tool'
import { createGetTaskContextTool } from './get-task-context.tool'
import { createSearchRouteTemplatesTool } from './search-route-templates.tool'
import { createSubmitReviewPackageTool } from './submit-review-package.tool'

describe('AI Create actual tool model contract', () => {
  it('keeps the budgeted descriptions and input schemas aligned with Mastra tools', () => {
    const config = {
      apiBaseUrl: 'http://localhost:3000',
      serviceSecret: 'test-secret',
      modelApiKey: 'test-key',
    }
    const actualTools = {
      getTaskContext: createGetTaskContextTool(config),
      searchRouteTemplates: createSearchRouteTemplatesTool(config),
      submitReviewPackage: createSubmitReviewPackageTool(config),
      getMaterialParseResult: createGetMaterialParseResultTool(config),
    }
    const budgeted = JSON.parse(
      aiCreateModelContractForTools(AI_CREATE_TOOL_NAMES).toolSchemaText,
    ) as Array<{
      name: keyof typeof actualTools
      description: string
      inputSchema: unknown
    }>

    for (const entry of budgeted) {
      const actual = actualTools[entry.name]
      expect(actual.description).toBe(entry.description)
      expect(normalizeSchema(standardSchemaToJSONSchema(actual.inputSchema as never, { io: 'input' })))
        .toEqual(normalizeSchema(entry.inputSchema))
    }
  })
})

function normalizeSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeSchema)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeSchema(item)]),
    )
  }
  return value
}
