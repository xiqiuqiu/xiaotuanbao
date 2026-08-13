import { z } from 'zod'
import { aiCollaborationErrorSchema } from '../errors/ai-collaboration-error'

export const assistStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('run.started'),
    runStatus: z.literal('running'),
  }),
  z.object({
    type: z.literal('message.delta'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('run.completed'),
    runStatus: z.literal('completed'),
  }),
  z.object({
    type: z.literal('run.failed'),
    runStatus: z.literal('failed'),
    error: aiCollaborationErrorSchema,
  }),
])

export type AssistStreamEvent = z.infer<typeof assistStreamEventSchema>
