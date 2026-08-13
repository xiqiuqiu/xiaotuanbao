import { z } from 'zod'

export const aiCreateSharedLightStateSchema = z
  .object({
    taskId: z.string().min(1),
    stageKey: z.literal('basic_info'),
    runStatus: z.enum(['idle', 'running', 'completed', 'failed']),
    reviewPackageId: z.string().nullable(),
    snapshotVersion: z.number().int().nonnegative(),
    progress: z.enum(['collecting', 'awaiting_review', 'ready']),
  })
  .strip()

export type AiCreateSharedLightState = z.infer<typeof aiCreateSharedLightStateSchema>
