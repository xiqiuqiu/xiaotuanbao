import { createPrismaAiActionStore } from './ai-action.prisma.store'
import type { AiActionRepeatObservationDraft } from './ai-action.types'

const draft: AiActionRepeatObservationDraft = {
  organizationId: 'org-1',
  name: 'submitReviewPackage',
  targetRef: { kind: 'departure_creation_draft', id: 'task-1' },
  inputHash: 'abc',
  actionId: 'action-2',
}

describe('createPrismaAiActionStore.observeRepeat', () => {
  it('rolls the caller transaction back to a savepoint when observation write fails', async () => {
    const sql: string[] = []
    const store = createPrismaAiActionStore({
      $executeRawUnsafe: async (query: string) => {
        sql.push(String(query))
      },
      aiAction: {
        count: async () => {
          throw new Error('observation lookup failed')
        },
      },
      aiActionRepeatObservation: {
        create: async () => {
          throw new Error('should not create')
        },
      },
    } as never)

    await expect(store.observeRepeat(draft)).rejects.toThrow('observation lookup failed')
    expect(sql.some((item) => item.includes('SAVEPOINT'))).toBe(true)
    expect(sql.some((item) => item.includes('ROLLBACK TO SAVEPOINT'))).toBe(true)
  })

  it('still writes the observation when there is no caller transaction to isolate', async () => {
    const created: unknown[] = []
    const store = createPrismaAiActionStore({
      $executeRawUnsafe: async () => {
        throw new Error('SAVEPOINT can only be used in transaction blocks')
      },
      aiAction: {
        count: async () => 1,
      },
      aiActionRepeatObservation: {
        create: async (args: { data: unknown }) => {
          created.push(args.data)
          return args.data
        },
      },
    } as never)

    await store.observeRepeat(draft)
    expect(created).toHaveLength(1)
  })
})
