import { z } from 'zod'

export const GET_MATERIAL_PARSE_RESULT_TOOL = {
  name: 'getMaterialParseResult',
  version: 1,
} as const

export const getMaterialParseResultInputSchema = z
  .object({
    taskId: z.string().min(1),
    runId: z.string().min(1),
    materialId: z.string().min(1),
    parseResultVersion: z.number().int().positive(),
    pageNumber: z.number().int().positive().optional(),
  })
  .strip()

export const getMaterialParseResultOutputSchema = z
  .object({
    materialId: z.string().min(1),
    parseResultVersion: z.number().int().positive(),
    pageCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    pages: z.array(
      z
        .object({
          pageNumber: z.number().int().positive(),
          source: z.enum(['native_pdf', 'ocr']),
          text: z.string(),
        })
        .strip(),
    ),
  })
  .strip()

export type GetMaterialParseResultInput = z.infer<typeof getMaterialParseResultInputSchema>
export type GetMaterialParseResultOutput = z.infer<typeof getMaterialParseResultOutputSchema>
