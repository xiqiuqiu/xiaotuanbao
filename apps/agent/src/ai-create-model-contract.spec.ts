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
      proposeReviewPackage: createSubmitReviewPackageTool(config),
      getMaterialParseResult: createGetMaterialParseResultTool(config),
    }
    const budgeted = JSON.parse(
      aiCreateModelContractForTools(AI_CREATE_TOOL_NAMES).toolSchemaText,
    ) as unknown
    const actualModelTools = Object.entries(actualTools).map(([name, tool]) => ({
      type: 'function',
      name,
      description: tool.description,
      inputSchema: standardSchemaToJSONSchema(tool.inputSchema as never, { io: 'input' }),
    }))

    expect(normalizeSchema(budgeted)).toEqual(normalizeSchema(actualModelTools))
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
