import { z } from 'zod'
import {
  GET_MATERIAL_PARSE_RESULT_TOOL,
  getMaterialParseResultOutputSchema,
} from '../tools/get-material-parse-result'
import { GET_TASK_CONTEXT_TOOL, getTaskContextOutputSchema } from '../tools/get-task-context'
import {
  SEARCH_ROUTE_TEMPLATES_TOOL,
  searchRouteTemplatesModelInputSchema,
  searchRouteTemplatesOutputSchema,
} from '../tools/search-route-templates'
import {
  SUBMIT_REVIEW_PACKAGE_TOOL,
  submitReviewPackageModelInputSchema,
  submitReviewPackageOutputSchema,
} from '../tools/review-package'
import {
  CapabilityDefinitionRegistry,
  requestContextSchema,
  type AgentCapabilityDeclaration,
  type CapabilityDefinition,
} from './agent-platform'

export const AI_CREATE_AGENT_DEFINITION_REF = {
  key: 'departure.create',
  version: 1,
} as const

export const AI_CREATE_CAPABILITY_REFS_BY_TOOL = {
  getTaskContext: {
    key: 'departure.task-context.read',
    version: GET_TASK_CONTEXT_TOOL.version,
  },
  searchRouteTemplates: {
    key: 'departure.route-template.search',
    version: SEARCH_ROUTE_TEMPLATES_TOOL.version,
  },
  submitReviewPackage: {
    key: 'departure.review-package.propose',
    version: SUBMIT_REVIEW_PACKAGE_TOOL.version,
  },
  getMaterialParseResult: {
    key: 'departure.material-parse-result.read',
    version: GET_MATERIAL_PARSE_RESULT_TOOL.version,
  },
} as const

export const AI_CREATE_AGENT_CAPABILITY_DECLARATION = {
  ...AI_CREATE_AGENT_DEFINITION_REF,
  capabilities: Object.values(AI_CREATE_CAPABILITY_REFS_BY_TOOL),
} as const satisfies AgentCapabilityDeclaration

export const AI_CREATE_CAPABILITY_DEFINITIONS = [
  {
    ...AI_CREATE_CAPABILITY_REFS_BY_TOOL.getTaskContext,
    toolName: GET_TASK_CONTEXT_TOOL.name,
    kind: 'read',
    risk: 'low',
    requiredPermissionKeys: ['departure:write'],
    requiredObjectScopes: [{ kind: 'ai_create_task', idFromContext: 'taskId' }],
    inputSchema: z.object({}).strict(),
    outputSchema: getTaskContextOutputSchema,
    contextSchema: requestContextSchema,
    gateway: {
      actionKind: 'read',
      decision: 'allow',
      targetKind: 'ai_create_task',
      denyCodes: ['TARGET_MISSING', 'CROSS_ORGANIZATION', 'OBJECT_SCOPE_DENIED', 'TARGET_MISMATCH'],
    },
  },
  {
    ...AI_CREATE_CAPABILITY_REFS_BY_TOOL.searchRouteTemplates,
    toolName: SEARCH_ROUTE_TEMPLATES_TOOL.name,
    kind: 'read',
    risk: 'low',
    requiredPermissionKeys: ['departure:write'],
    requiredObjectScopes: [],
    inputSchema: searchRouteTemplatesModelInputSchema,
    outputSchema: searchRouteTemplatesOutputSchema,
    contextSchema: requestContextSchema,
    gateway: {
      actionKind: 'read',
      decision: 'allow',
      targetKind: 'route_template_catalog',
      denyCodes: ['TARGET_MISMATCH'],
    },
  },
  {
    ...AI_CREATE_CAPABILITY_REFS_BY_TOOL.submitReviewPackage,
    toolName: SUBMIT_REVIEW_PACKAGE_TOOL.name,
    kind: 'propose',
    risk: 'medium',
    requiredPermissionKeys: ['departure:write'],
    requiredObjectScopes: [{ kind: 'ai_create_task', idFromContext: 'taskId' }],
    inputSchema: submitReviewPackageModelInputSchema,
    outputSchema: submitReviewPackageOutputSchema,
    contextSchema: requestContextSchema,
    gateway: {
      actionKind: 'write',
      decision: 'review',
      targetKind: 'departure_creation_draft',
      denyCodes: [
        'TARGET_MISSING',
        'CROSS_ORGANIZATION',
        'OBJECT_SCOPE_DENIED',
        'TARGET_MISMATCH',
        'TARGET_VERSION_MISMATCH',
      ],
    },
  },
  {
    ...AI_CREATE_CAPABILITY_REFS_BY_TOOL.getMaterialParseResult,
    toolName: GET_MATERIAL_PARSE_RESULT_TOOL.name,
    kind: 'read',
    risk: 'low',
    requiredPermissionKeys: ['departure:write'],
    requiredObjectScopes: [],
    inputSchema: z
      .object({
        materialId: z.string().min(1),
        parseResultVersion: z.number().int().positive(),
        pageNumber: z.number().int().positive().optional(),
      })
      .strict(),
    outputSchema: getMaterialParseResultOutputSchema,
    contextSchema: requestContextSchema,
    gateway: {
      actionKind: 'read',
      decision: 'allow',
      targetKind: 'departure_material',
      denyCodes: [
        'TARGET_MISSING',
        'CROSS_ORGANIZATION',
        'OBJECT_SCOPE_DENIED',
        'TARGET_MISMATCH',
        'TARGET_NOT_PINNED',
        'TARGET_VERSION_MISMATCH',
      ],
    },
  },
] as const satisfies readonly CapabilityDefinition[]

export const aiCreateCapabilityDefinitionRegistry = new CapabilityDefinitionRegistry(
  AI_CREATE_CAPABILITY_DEFINITIONS,
)

export function aiCreateCapabilityDefinitionForTool(toolName: string) {
  return AI_CREATE_CAPABILITY_DEFINITIONS.find((definition) => definition.toolName === toolName)
}
