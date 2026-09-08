import { z } from 'zod'
import { AI_CREATE_CAPABILITY_DEFINITIONS, AI_CREATE_CAPABILITY_REFS_BY_TOOL } from './ai-create-definitions'
import { GET_TASK_CONTEXT_TOOL } from '../tools/get-task-context'
import {
  GET_MATERIAL_PARSE_RESULT_TOOL,
  getMaterialParseResultOutputSchema,
} from '../tools/get-material-parse-result'
import {
  SEARCH_PARTNERS_TOOL,
  searchPartnersModelInputSchema,
  searchPartnersOutputSchema,
  SEARCH_SUPPLIERS_TOOL,
  searchSuppliersModelInputSchema,
  searchSuppliersOutputSchema,
} from '../tools/search-related-objects'
import {
  CONVERSATION_HISTORY_READ_CAPABILITY,
  CONVERSATION_HISTORY_READ_CAPABILITY_REF,
  CONVERSATION_SOURCE_READ_CAPABILITY,
  CONVERSATION_SOURCE_READ_CAPABILITY_REF,
} from './conversation-recall-definitions'
import {
  CapabilityDefinitionRegistry,
  requestContextSchema,
  type AgentCapabilityDeclaration,
  type AgentDefinition,
  type CapabilityDefinition,
} from './agent-platform'
import {
  SEGMENT_RESOURCE_CONFIRMATION_UNIT,
  SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA,
  segmentResourceReviewCandidateSchema,
  submitSegmentResourceReviewModelInputSchema,
} from '../review/segment-resource-schema'
import { SOURCE_ORDER_REVIEW_CONFIRMATION_UNIT, SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA } from '../review/envelope'
import { sourceOrderReviewCandidateInputSchema, submitSourceOrderReviewPackageModelInputSchema } from '../review/source-order-schema'
import { reviewProposalErrorSchema } from '../tools/review-package'
import { normalizedEvidenceProposalSchemaV1 } from '../evidence/evidence-contract'

export const DEPARTURE_COLLABORATION_AGENT_DEFINITION_REF = {
  key: 'departure.collaboration',
  version: 1,
} as const

export const PROPOSE_SEGMENT_RESOURCE_REVIEW_TOOL = {
  name: 'proposeSegmentResourceReviewPackage',
  version: 1,
} as const

export const DEPARTURE_SEGMENT_RESOURCE_PROPOSE_CAPABILITY_REF = {
  key: 'departure.segment-resource.propose',
  version: PROPOSE_SEGMENT_RESOURCE_REVIEW_TOOL.version,
} as const

export const DEPARTURE_SOURCE_ORDER_PROPOSE_CAPABILITY_REF = {
  key: 'departure.source-order.propose',
  version: 1,
} as const

export const DEPARTURE_COLLABORATION_CAPABILITY_REFS_BY_TOOL = {
  getTaskContext: AI_CREATE_CAPABILITY_REFS_BY_TOOL.getTaskContext,
  searchPartners: { key: 'departure.partner.search', version: SEARCH_PARTNERS_TOOL.version },
  proposeSourceOrderReviewPackage: DEPARTURE_SOURCE_ORDER_PROPOSE_CAPABILITY_REF,
  searchSuppliers: {
    key: 'departure.supplier.search',
    version: SEARCH_SUPPLIERS_TOOL.version,
  },
  getMaterialParseResult: {
    key: 'departure.material-parse-result.read',
    version: GET_MATERIAL_PARSE_RESULT_TOOL.version,
  },
  proposeSegmentResourceReviewPackage: DEPARTURE_SEGMENT_RESOURCE_PROPOSE_CAPABILITY_REF,
  readConversationHistory: CONVERSATION_HISTORY_READ_CAPABILITY_REF,
  readConversationSource: CONVERSATION_SOURCE_READ_CAPABILITY_REF,
} as const

export const proposeSegmentResourceReviewPackageOutputSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('accepted'),
      objectVersion: z.number().int().positive(),
      confirmationUnit: z.literal(SEGMENT_RESOURCE_CONFIRMATION_UNIT),
      payloadSchema: z.literal(SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA),
      candidates: z.array(segmentResourceReviewCandidateSchema).min(1),
      normalizedProposal: normalizedEvidenceProposalSchemaV1,
    })
    .strip(),
  z
    .object({
      status: z.literal('rejected'),
      errors: z.array(reviewProposalErrorSchema).min(1),
    })
    .strip(),
])

export type ProposeSegmentResourceReviewPackageOutput = z.infer<
  typeof proposeSegmentResourceReviewPackageOutputSchema
>

export const proposeSourceOrderReviewPackageOutputSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('accepted'),
    objectVersion: z.number().int().positive(),
    confirmationUnit: z.literal(SOURCE_ORDER_REVIEW_CONFIRMATION_UNIT),
    payloadSchema: z.literal(SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA),
    candidates: z.array(sourceOrderReviewCandidateInputSchema).min(1),
    normalizedProposal: normalizedEvidenceProposalSchemaV1,
  }).strip(),
  z.object({ status: z.literal('rejected'), errors: z.array(reviewProposalErrorSchema).min(1) }).strip(),
])
export type ProposeSourceOrderReviewPackageOutput = z.infer<typeof proposeSourceOrderReviewPackageOutputSchema>

export const DEPARTURE_COLLABORATION_AGENT_CAPABILITY_DECLARATION = {
  ...DEPARTURE_COLLABORATION_AGENT_DEFINITION_REF,
  capabilities: Object.values(DEPARTURE_COLLABORATION_CAPABILITY_REFS_BY_TOOL),
} as const satisfies AgentCapabilityDeclaration

const getMaterialParseResultCapability = {
  ...DEPARTURE_COLLABORATION_CAPABILITY_REFS_BY_TOOL.getMaterialParseResult,
  toolName: GET_MATERIAL_PARSE_RESULT_TOOL.name,
  kind: 'read' as const,
  risk: 'low' as const,
  requiredPermissionKeys: ['departure:write'] as const,
  requiredObjectScopes: [] as const,
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
    actionKind: 'read' as const,
    decision: 'allow' as const,
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
} as const satisfies CapabilityDefinition

const searchSuppliersCapability = {
  ...DEPARTURE_COLLABORATION_CAPABILITY_REFS_BY_TOOL.searchSuppliers,
  toolName: SEARCH_SUPPLIERS_TOOL.name,
  kind: 'read' as const,
  risk: 'low' as const,
  requiredPermissionKeys: ['departure:write'] as const,
  requiredObjectScopes: [] as const,
  inputSchema: searchSuppliersModelInputSchema,
  outputSchema: searchSuppliersOutputSchema,
  contextSchema: requestContextSchema,
  gateway: {
    actionKind: 'read' as const,
    decision: 'allow' as const,
    targetKind: 'supplier_catalog',
    denyCodes: ['TARGET_MISMATCH'],
  },
} as const satisfies CapabilityDefinition

export const DEPARTURE_SEGMENT_RESOURCE_PROPOSE_CAPABILITY = {
  ...DEPARTURE_SEGMENT_RESOURCE_PROPOSE_CAPABILITY_REF,
  toolName: PROPOSE_SEGMENT_RESOURCE_REVIEW_TOOL.name,
  kind: 'propose',
  risk: 'medium',
  requiredPermissionKeys: ['departure:write'],
  requiredObjectScopes: [{ kind: 'agent_task', idFromContext: 'taskId' }],
  inputSchema: submitSegmentResourceReviewModelInputSchema,
  outputSchema: proposeSegmentResourceReviewPackageOutputSchema,
  contextSchema: requestContextSchema,
  gateway: {
    actionKind: 'write',
    decision: 'review',
    targetKind: 'departure',
    denyCodes: [
      'TARGET_MISSING',
      'CROSS_ORGANIZATION',
      'OBJECT_SCOPE_DENIED',
      'TARGET_MISMATCH',
      'TARGET_VERSION_MISMATCH',
    ],
  },
} as const satisfies CapabilityDefinition

export const DEPARTURE_SOURCE_ORDER_PROPOSE_CAPABILITY = {
  ...DEPARTURE_SEGMENT_RESOURCE_PROPOSE_CAPABILITY,
  ...DEPARTURE_SOURCE_ORDER_PROPOSE_CAPABILITY_REF,
  toolName: 'proposeSourceOrderReviewPackage',
  inputSchema: submitSourceOrderReviewPackageModelInputSchema,
  outputSchema: proposeSourceOrderReviewPackageOutputSchema,
} as const satisfies CapabilityDefinition

export const DEPARTURE_COLLABORATION_CAPABILITY_DEFINITIONS = [
  AI_CREATE_CAPABILITY_DEFINITIONS[0],
  {
    ...searchSuppliersCapability,
    ...DEPARTURE_COLLABORATION_CAPABILITY_REFS_BY_TOOL.searchPartners,
    toolName: SEARCH_PARTNERS_TOOL.name,
    inputSchema: searchPartnersModelInputSchema,
    outputSchema: searchPartnersOutputSchema,
    gateway: { ...searchSuppliersCapability.gateway, targetKind: 'partner_catalog' },
  },
  DEPARTURE_SOURCE_ORDER_PROPOSE_CAPABILITY,
  searchSuppliersCapability,
  getMaterialParseResultCapability,
  DEPARTURE_SEGMENT_RESOURCE_PROPOSE_CAPABILITY,
  CONVERSATION_HISTORY_READ_CAPABILITY,
  CONVERSATION_SOURCE_READ_CAPABILITY,
] as const satisfies readonly CapabilityDefinition[]

export const DEPARTURE_COLLABORATION_INSTRUCTIONS = [
  '你是小团宝已有发团协作助手，根据用户提供的对话和材料整理客源单或行程段资源费用。不得凭空生成业务记录。',
  '必须先调用 getTaskContext 查询当前正式发团。snapshot.sourceOrders 是已写入客源，guestCount、adultGuestCount、childGuestCount 是客源合计人数；expectedGuestCountHint 仅为建团时的预计提示，不能代替实际人数。查询客源或人数时依据这些正式事实回答，不得因草稿提示缺失而说没有客源或人数；已有客源不代表本次待新增客源，不能擅自沿用其报价或收款约定。',
  '【当前业务事实】含本团正式行程段列表。材料确定某日服务时，itinerarySegmentId 必须是该列表中的 id；不存在对应段时向 User 核实，不能凭页面日期或交流背景默认挂靠。',
  '只提交资源种类、供应商、资源名称、正总价和备注；不要编造数量、单价或容量字段。',
  '容量等执行冲突有材料依据时写入 capacityWarning 提醒，不要因此拒绝合法费用。',
  '约定总价必须为正整数分，金额未知不要用 0 代替。资源名称必填，可按材料整理，不得虚构房型或服务标准。',
  '供应商必须调用 searchSuppliers，只使用工具返回的真实对象；种类变化后重新搜索校验。',
  'User 明确引用资料时调用 getMaterialParseResult 或 readConversationSource。',
  '对话候选必须引用本轮指令中标明的用户消息 sequence 和原文摘录，evidence.kind=user_message。材料候选使用 material_region，引用真实 materialId、parseResultVersion、pageNumber 和原文。客户匹配、元转分、枚举映射也引用对应用户原文，不要编造 system_derivation 规则。',
  '客源单客户必须通过 searchPartners 匹配，多个结果、hasMore 或无结果时先核实，不能编造客户 ID。',
  '客源单只采用已有字段：客户、成人和儿童人数及单价、团款调整、优惠、收款约定、备注及客人名单。金额均为整数分。没有提供的字段保持缺失，不得默认儿童为 0、无调整或无优惠。明确没有调整时 fareAdjustments=[]；优惠只支持 none 或 lump_sum。',
  '客源单 collectionMode 为 partner_settled（客户结算）、guest_only（全部我方代收）或 split（分拆收款）；定金尾款是收款约定，不是到账记录。不要强制其合计等于结算金额。',
  '客源单候选调用 proposeSourceOrderReviewPackage；资源候选调用 proposeSegmentResourceReviewPackage。一次只提交一个事项，工具 accepted 后结束本轮；材料包含多个事项时先核实本次处理哪一项，其余可在同一会话后续整理。',
  '确认只在右侧审核完成，不在聊天里提供写入确认。不得自动创建应收、应付、流水或核销；客源单创建后再由用户选择后续应收。',
].join('')

export const DEPARTURE_COLLABORATION_AGENT_DEFINITION = {
  ...DEPARTURE_COLLABORATION_AGENT_CAPABILITY_DECLARATION,
  name: '发团协作助手',
  instructions: DEPARTURE_COLLABORATION_INSTRUCTIONS,
} as const satisfies AgentDefinition

export const departureCollaborationCapabilityDefinitionRegistry = new CapabilityDefinitionRegistry(
  DEPARTURE_COLLABORATION_CAPABILITY_DEFINITIONS,
)

export const DEPARTURE_COLLABORATION_CONTEXT_TOOL_NAMES = [
  GET_TASK_CONTEXT_TOOL.name,
  SEARCH_PARTNERS_TOOL.name,
  'proposeSourceOrderReviewPackage',
  SEARCH_SUPPLIERS_TOOL.name,
  GET_MATERIAL_PARSE_RESULT_TOOL.name,
  PROPOSE_SEGMENT_RESOURCE_REVIEW_TOOL.name,
  'readConversationHistory',
  'readConversationSource',
] as const
