import { departureObjectVersion } from '../ai-create-task/departure-object-version'
import { createPrismaAiActionTargetAuthority } from './ai-action.prisma.target-authority'

describe('createPrismaAiActionTargetAuthority.findTask', () => {
  it('uses the departure fact fingerprint as departureVersion, not updatedAt', async () => {
    const updatedAt = new Date('2026-09-13T08:06:48.143Z')
    const snapshot = '{"departure":{"id":"dep-1"},"sourceOrders":null}'
    const client = {
      agentTask: {
        findUnique: async () => ({
          id: 'task-1',
          organizationId: 'org-1',
          ownerUserId: 'user-1',
          departureId: 'dep-1',
          departure: { updatedAt },
          departureCreationTask: null,
        }),
      },
      $queryRaw: async () => [{ snapshot }],
    }

    const fact = await createPrismaAiActionTargetAuthority(client as never).findTask('task-1')

    expect(fact?.departureVersion).toBe(await departureObjectVersion(client as never, 'org-1', 'dep-1'))
    expect(fact?.departureVersion).not.toBe(updatedAt.getTime())
  })
})
