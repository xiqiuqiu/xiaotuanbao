import { UserStatus } from '@prisma/client'
import { UserService } from './user.service'

describe('UserService.update login username', () => {
  const organizationId = 'org-1'
  const userId = 'user-1'
  const roleId = 'role-1'
  const existingUser = {
    id: userId,
    organizationId,
    username: 'xiaoli',
    name: '小李',
    remark: null,
    status: UserStatus.enabled,
    lastLoginAt: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  }

  function createService(overrides?: {
    findFirstResults?: unknown[]
    updatedUser?: unknown
  }) {
    const findFirstResults = overrides?.findFirstResults ?? [existingUser]
    const updatedUser = overrides?.updatedUser ?? {
      ...existingUser,
      username: 'lihua',
      name: '小李',
      roles: [{ role: { name: '计调' } }],
    }
    const prisma = {
      user: {
        findFirst: jest.fn().mockImplementation(() => {
          const next = findFirstResults.shift()
          return Promise.resolve(next ?? null)
        }),
      },
      role: {
        findUnique: jest.fn().mockResolvedValue({ id: roleId, name: '计调' }),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          userRole: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
          user: {
            update: jest.fn().mockResolvedValue(updatedUser),
          },
        }
        return callback(tx)
      }),
    }
    return { service: new UserService(prisma as never), prisma }
  }

  it('updates login username when the new name is free', async () => {
    const { service, prisma } = createService({
      findFirstResults: [existingUser, null],
    })

    const result = await service.update(organizationId, userId, {
      username: ' lihua ',
      name: '小李',
      roleId,
      status: UserStatus.enabled,
    })

    expect(result.username).toBe('lihua')
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId,
        username: 'lihua',
        id: { not: userId },
      },
    })
  })

  it('rejects when another employee already owns the login username', async () => {
    const { service } = createService({
      findFirstResults: [
        existingUser,
        { id: 'user-2', username: 'occupied' },
      ],
    })

    await expect(
      service.update(organizationId, userId, {
        username: 'occupied',
        name: '小李',
        roleId,
        status: UserStatus.enabled,
      }),
    ).rejects.toMatchObject({
      message: '用户名已存在',
    })
  })

  it('allows saving without changing login username', async () => {
    const { service } = createService({
      findFirstResults: [existingUser, null],
      updatedUser: {
        ...existingUser,
        name: '李改名',
        roles: [{ role: { name: '计调' } }],
      },
    })

    const result = await service.update(organizationId, userId, {
      username: 'xiaoli',
      name: '李改名',
      roleId,
      status: UserStatus.enabled,
    })

    expect(result.username).toBe('xiaoli')
    expect(result.name).toBe('李改名')
  })
})
