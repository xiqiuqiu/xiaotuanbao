import { z } from 'zod'

export const SEARCH_RELATED_OBJECTS_LIMIT = 5

export const SEARCH_RELATED_OBJECT_KINDS = [
  'user',
  'supplier',
  'partner',
  'route_template',
] as const

export type SearchRelatedObjectKind = (typeof SEARCH_RELATED_OBJECT_KINDS)[number]

export const SEARCH_USERS_TOOL = {
  name: 'searchUsers',
  version: 1,
} as const

export const SEARCH_SUPPLIERS_TOOL = {
  name: 'searchSuppliers',
  version: 1,
} as const

export const SEARCH_PARTNERS_TOOL = {
  name: 'searchPartners',
  version: 1,
} as const

export const relatedObjectMatchReasonSchema = z
  .object({
    code: z.literal('name_contains_token'),
    token: z.string().trim().min(1).max(200),
  })
  .strip()

export const searchRelatedObjectStatusSchema = z.enum(['enabled', 'disabled'])

export const searchUserItemSchema = z
  .object({
    kind: z.literal('user'),
    id: z.string().min(1),
    name: z.string().min(1),
    status: searchRelatedObjectStatusSchema,
    matchReasons: z.array(relatedObjectMatchReasonSchema).min(1),
  })
  .strip()

export const searchSupplierItemSchema = z
  .object({
    kind: z.literal('supplier'),
    id: z.string().min(1),
    name: z.string().min(1),
    status: searchRelatedObjectStatusSchema,
    categories: z.array(z.string().min(1)).min(1),
    matchReasons: z.array(relatedObjectMatchReasonSchema).min(1),
  })
  .strip()

export const searchPartnerItemSchema = z
  .object({
    kind: z.literal('partner'),
    id: z.string().min(1),
    name: z.string().min(1),
    status: searchRelatedObjectStatusSchema,
    partnerKind: z.string().min(1),
    matchReasons: z.array(relatedObjectMatchReasonSchema).min(1),
  })
  .strip()

export const searchUsersInputSchema = z
  .object({
    taskId: z.string().min(1),
    runId: z.string().min(1),
    keyword: z.string().max(200).optional(),
  })
  .strip()

export const searchUsersModelInputSchema = z
  .object({
    keyword: z.string().max(200).optional(),
  })
  .strip()

export const searchUsersOutputSchema = z
  .object({
    items: z.array(searchUserItemSchema).max(SEARCH_RELATED_OBJECTS_LIMIT),
  })
  .strip()

export const searchSuppliersInputSchema = z
  .object({
    taskId: z.string().min(1),
    runId: z.string().min(1),
    keyword: z.string().max(200).optional(),
    category: z.string().min(1).max(40).optional(),
  })
  .strip()

export const searchSuppliersModelInputSchema = z
  .object({
    keyword: z.string().max(200).optional(),
    category: z.string().min(1).max(40).optional(),
  })
  .strip()

export const searchSuppliersOutputSchema = z
  .object({
    items: z.array(searchSupplierItemSchema).max(SEARCH_RELATED_OBJECTS_LIMIT),
  })
  .strip()

export const searchPartnersInputSchema = z
  .object({
    taskId: z.string().min(1),
    runId: z.string().min(1),
    keyword: z.string().max(200).optional(),
  })
  .strip()

export const searchPartnersModelInputSchema = z
  .object({
    keyword: z.string().max(200).optional(),
  })
  .strip()

export const searchPartnersOutputSchema = z
  .object({
    items: z.array(searchPartnerItemSchema).max(SEARCH_RELATED_OBJECTS_LIMIT),
  })
  .strip()

export type RelatedObjectMatchReason = z.infer<typeof relatedObjectMatchReasonSchema>
export type SearchUserItem = z.infer<typeof searchUserItemSchema>
export type SearchSupplierItem = z.infer<typeof searchSupplierItemSchema>
export type SearchPartnerItem = z.infer<typeof searchPartnerItemSchema>
export type SearchUsersInput = z.infer<typeof searchUsersInputSchema>
export type SearchUsersModelInput = z.infer<typeof searchUsersModelInputSchema>
export type SearchUsersOutput = z.infer<typeof searchUsersOutputSchema>
export type SearchSuppliersInput = z.infer<typeof searchSuppliersInputSchema>
export type SearchSuppliersModelInput = z.infer<typeof searchSuppliersModelInputSchema>
export type SearchSuppliersOutput = z.infer<typeof searchSuppliersOutputSchema>
export type SearchPartnersInput = z.infer<typeof searchPartnersInputSchema>
export type SearchPartnersModelInput = z.infer<typeof searchPartnersModelInputSchema>
export type SearchPartnersOutput = z.infer<typeof searchPartnersOutputSchema>
