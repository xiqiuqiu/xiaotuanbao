import { ForbiddenException } from '@nestjs/common'
import { MenuPermissionGuard } from './menu-permission.guard'

describe('MenuPermissionGuard', () => {
  function createGuard(permissionKeys: string[], requiredKey = '/departure') {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(requiredKey) }
    const authService = {
      getPermissionKeysForUser: jest.fn().mockResolvedValue(permissionKeys),
    }
    const guard = new MenuPermissionGuard(reflector as never, authService as never)
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { userId: 'user-1' } }),
      }),
    }
    return { guard, context }
  }

  it('lets a /departure caller through even without departure:write', async () => {
    const { guard, context } = createGuard(['/departure'])
    await expect(guard.canActivate(context as never)).resolves.toBe(true)
  })

  it('blocks departure:write without /departure on a /departure route', async () => {
    const { guard, context } = createGuard(['departure:write'])
    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(ForbiddenException)
  })
})
