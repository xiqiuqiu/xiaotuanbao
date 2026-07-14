import { JwtService } from '@nestjs/jwt'
import { UserStatus } from '@prisma/client'
import { hash } from 'bcryptjs'
import { AuthService } from './auth.service'

describe('AuthService', () => {
  it('成功登录只记录最近登录时间，不刷新员工档案更新时间', async () => {
    const updatedAt = new Date('2026-07-01T02:03:04.000Z')
    const user = {
      id: 'user-1',
      organizationId: 'org-1',
      organization: { name: '测试旅行社' },
      username: 'employee',
      passwordHash: await hash('password123', 4),
      name: '测试员工',
      status: UserStatus.enabled,
      isPlatformAdmin: false,
      updatedAt,
      roles: [],
    }
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      user: {
        findFirst: jest.fn().mockResolvedValue(user),
        update: jest.fn(),
      },
    }
    const jwtService = {
      signAsync: jest.fn().mockResolvedValue('access-token'),
    }
    const service = new AuthService(
      prisma as never,
      jwtService as unknown as JwtService,
    )

    await service.login({ username: ' employee ', password: 'password123' })

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1)
    const [queryParts, lastLoginAt, userId] = prisma.$executeRaw.mock.calls[0]
    expect(queryParts.join('')).toContain('SET "last_login_at" = ')
    expect(queryParts.join('')).not.toContain('updated_at')
    expect(lastLoginAt).toEqual(expect.any(Date))
    expect(userId).toBe(user.id)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })
})
