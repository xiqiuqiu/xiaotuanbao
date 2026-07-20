import { ForbiddenException } from '@nestjs/common'
import { FinanceReferenceController } from './finance-reference.controller'

/**
 * 回归：财务参考选项接口（departure/partner/supplier/source-order-options）的访问口径。
 *
 * 现象（用户实测）：计调打开「合作伙伴 / 供应商 → 往来账款」Tab 时，前端
 * usePaymentScheduleWorkspace 以 `enabled: !isDepartureScope` 拉取 GET /finance/departure-options
 * 显示节点所属发团名，但该接口只放行持有 /finance/* 的角色，计调（无任何 /finance/*）→ 403
 * 「无权访问」。这类接口用**命令式** assertFinanceAccess 而非 @RequireMenu，故权限矩阵 e2e
 * 看不到、漏判。
 *
 * 正确口径：这些是「能看见该类实体就能取的参考数据」，应按各自业务菜单放行——
 * departure-options→/departure、partner-options→/partner、supplier-options→/supplier、
 * source-order-options→/departure；财务四个 /finance/* 任一亦可。
 */
describe('FinanceReferenceController 访问口径 (ADR-0023)', () => {
  const COORDINATOR_MENU_KEYS = ['/', '/departure', '/partner', '/supplier']
  const FINANCE_MENU_KEYS = [
    '/',
    '/departure',
    '/partner',
    '/supplier',
    '/finance/receivable',
    '/finance/payable',
    '/finance/transactions',
    '/finance/verification',
  ]
  const SYSTEM_ONLY_MENU_KEYS = ['/', '/system/users']

  function buildController(menuKeys: string[]) {
    const authService = {
      getMenuKeysForUser: jest.fn().mockResolvedValue(menuKeys),
    }
    const facade = {
      listDepartureOptions: jest.fn().mockResolvedValue([]),
      listPartnerOptions: jest.fn().mockResolvedValue([]),
      listSupplierOptions: jest.fn().mockResolvedValue([]),
      listSourceOrderOptions: jest.fn().mockResolvedValue([]),
    }
    const controller = new FinanceReferenceController(
      authService as never,
      facade as never,
    )
    return { controller, authService, facade }
  }

  const req = (userId = 'user-1') => ({ user: { organizationId: 'org-1', userId } })

  describe('计调（持有业务菜单、无任何 /finance/*）可取参考选项', () => {
    it('departure-options：计调可调（往来账款 Tab 显示发团名依赖它）', async () => {
      const { controller, facade } = buildController(COORDINATOR_MENU_KEYS)
      await expect(controller.listDepartureOptions(req())).resolves.toEqual([])
      expect(facade.listDepartureOptions).toHaveBeenCalledWith('org-1')
    })

    it('partner-options：计调可调', async () => {
      const { controller } = buildController(COORDINATOR_MENU_KEYS)
      await expect(controller.listPartnerOptions(req())).resolves.toEqual([])
    })

    it('supplier-options：计调可调', async () => {
      const { controller } = buildController(COORDINATOR_MENU_KEYS)
      await expect(controller.listSupplierOptions(req())).resolves.toEqual([])
    })

    it('source-order-options：计调可调（挂 /departure）', async () => {
      const { controller } = buildController(COORDINATOR_MENU_KEYS)
      await expect(controller.listSourceOrderOptions(req(), 'dep-1')).resolves.toEqual([])
    })
  })

  describe('财务（持有 /finance/*）仍可取（回归守卫）', () => {
    it('departure-options：财务可调', async () => {
      const { controller } = buildController(FINANCE_MENU_KEYS)
      await expect(controller.listDepartureOptions(req())).resolves.toEqual([])
    })
  })

  describe('既无业务菜单也无 /finance/* 者仍被拒（守卫不失效）', () => {
    it('departure-options：仅 /system 角色 → 403', async () => {
      const { controller } = buildController(SYSTEM_ONLY_MENU_KEYS)
      await expect(controller.listDepartureOptions(req())).rejects.toBeInstanceOf(
        ForbiddenException,
      )
    })

    it('partner-options：仅 /system 角色 → 403', async () => {
      const { controller } = buildController(SYSTEM_ONLY_MENU_KEYS)
      await expect(controller.listPartnerOptions(req())).rejects.toBeInstanceOf(
        ForbiddenException,
      )
    })
  })
})
