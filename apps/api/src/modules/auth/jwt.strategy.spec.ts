import { UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OrganizationStatus, UserStatus } from '@prisma/client'
import type { Request } from 'express'
import { JwtStrategy } from './jwt.strategy'

function createStrategy(
  prisma: { user: { findFirst: jest.Mock } } = { user: { findFirst: jest.fn() } },
  allowLegacyBearer = false,
) {
  return new JwtStrategy(
    new ConfigService({
      app: {
        jwtSecret: 'test-secret',
        authAllowLegacyBearer: allowLegacyBearer,
      },
    }),
    prisma as never,
  )
}

function extractor(allowLegacyBearer: boolean) {
  return (
    createStrategy({ user: { findFirst: jest.fn() } }, allowLegacyBearer) as unknown as {
      _jwtFromRequest: (request: Request) => string | null
    }
  )._jwtFromRequest
}

function request(headers: Record<string, string>): Request {
  return { headers } as unknown as Request
}

describe('JwtStrategy token extraction', () => {
  it('returns null when the Cookie is missing or malformed', () => {
    const extract = extractor(false)

    expect(extract(request({}))).toBeNull()
    expect(extract(request({ cookie: 'xtb_session=%E0%A4%A' }))).toBeNull()
  })

  it('rejects a legacy Bearer token when compatibility is disabled', () => {
    const extract = extractor(false)

    expect(extract(request({ authorization: 'Bearer legacy-token' }))).toBeNull()
  })

  it('accepts a legacy Bearer token only when compatibility is enabled', () => {
    const extract = extractor(true)

    expect(extract(request({ authorization: 'Bearer legacy-token' }))).toBe('legacy-token')
  })

  it('prefers the Cookie when Cookie and legacy Header are both present', () => {
    const extract = extractor(true)

    expect(
      extract(
        request({
          cookie: 'xtb_session=cookie-token',
          authorization: 'Bearer legacy-token',
        }),
      ),
    ).toBe('cookie-token')
  })
})

describe('JwtStrategy.validate', () => {
  const enabledUser = {
    id: 'user-1',
    organizationId: 'org-1',
    isPlatformAdmin: false,
  }

  it('rejects an ai-op-delegation token as a session credential', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(enabledUser) },
    }
    const strategy = createStrategy(prisma)

    await expect(
      strategy.validate({
        typ: 'ai-op-delegation',
        sub: enabledUser.id,
        organizationId: enabledUser.organizationId,
        isPlatformAdmin: false,
        taskId: 'task-1',
        runId: 'run-1',
      } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException)

    expect(prisma.user.findFirst).not.toHaveBeenCalled()
  })

  it('rejects a token whose aud is the AI operation audience', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(enabledUser) },
    }
    const strategy = createStrategy(prisma)

    await expect(
      strategy.validate({
        sub: enabledUser.id,
        organizationId: enabledUser.organizationId,
        isPlatformAdmin: false,
        aud: 'ai-op-delegation',
      } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException)

    expect(prisma.user.findFirst).not.toHaveBeenCalled()
  })

  it('accepts a login session payload without typ', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(enabledUser),
      },
    }
    const strategy = createStrategy(prisma)

    await expect(
      strategy.validate({
        sub: enabledUser.id,
        organizationId: enabledUser.organizationId,
        isPlatformAdmin: false,
      }),
    ).resolves.toEqual({
      userId: enabledUser.id,
      organizationId: enabledUser.organizationId,
      isPlatformAdmin: false,
    })
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: enabledUser.id,
          organizationId: enabledUser.organizationId,
          status: UserStatus.enabled,
          deletedAt: null,
          organization: { deletedAt: null, status: OrganizationStatus.enabled },
        }),
      }),
    )
  })
})
