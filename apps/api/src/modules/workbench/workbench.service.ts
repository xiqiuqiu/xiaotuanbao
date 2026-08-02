import { ForbiddenException, Injectable } from '@nestjs/common'
import {
  DEPARTURE_WRITE_ACTION_KEY,
  PRESET_ROLE_NAMES,
  type MenuKey,
  type PresetRoleName,
  type WorkbenchAction,
  type WorkbenchModule,
  type WorkbenchSnapshot,
  type WorkbenchTemplate,
} from '@xiaotuanbao/shared'
import { PrismaService } from '../../database/prisma/prisma.service'
import { CoordinatorWorkbenchService } from './coordinator-workbench.service'
import { CoordinatorSettlementWorkbenchService } from './coordinator-settlement-workbench.service'
import { CoordinatorTrendWorkbenchService } from './coordinator-trend-workbench.service'
import { OrganizationScaleWorkbenchService } from './organization-scale-workbench.service'
import { FinanceReceivablesWorkbenchService } from './finance-receivables-workbench.service'
import { FinanceFundsWorkbenchService } from './finance-funds-workbench.service'
import { OrganizationRiskWorkbenchService } from './organization-risk-workbench.service'

interface ModuleDefinition extends Omit<WorkbenchModule, 'metrics' | 'items'> {
  requiredPermissions: readonly MenuKey[]
}

const TEMPLATE_PRIORITY: readonly [roleName: PresetRoleName, template: WorkbenchTemplate][] = [
  [PRESET_ROLE_NAMES.ORG_ADMIN, 'organization_admin'],
  [PRESET_ROLE_NAMES.FINANCE, 'finance'],
  [PRESET_ROLE_NAMES.COORDINATOR, 'coordinator'],
]

const MODULES_BY_TEMPLATE: Record<WorkbenchTemplate, readonly ModuleDefinition[]> = {
  organization_admin: [
    {
      key: 'organization-scale',
      title: '业务规模与趋势',
      requiredPermissions: ['/departure'],
    },
    {
      key: 'organization-risk',
      title: '经营风险摘要',
      requiredPermissions: [
        '/finance/receivable',
        '/finance/payable',
        '/finance/transactions',
        '/departure',
      ],
    },
  ],
  finance: [
    {
      key: 'finance-receivables',
      title: '应收跟进',
      requiredPermissions: ['/finance/receivable'],
    },
    {
      key: 'finance-funds',
      title: '资金与账款',
      requiredPermissions: ['/finance/payable', '/finance/transactions', '/departure'],
    },
  ],
  coordinator: [
    {
      key: 'coordinator-departures',
      title: '近期发团',
      requiredPermissions: ['/departure'],
    },
    {
      key: 'coordinator-settlement',
      title: '待提交账款',
      requiredPermissions: ['/departure'],
    },
    {
      key: 'coordinator-trend',
      title: '未来团量与客流',
      requiredPermissions: ['/departure'],
    },
  ],
}

function selectTemplate(roleNames: ReadonlySet<string>): WorkbenchTemplate | null {
  return TEMPLATE_PRIORITY.find(([roleName]) => roleNames.has(roleName))?.[1] ?? null
}

function buildModules(
  template: WorkbenchTemplate,
  permissionKeys: ReadonlySet<string>,
): WorkbenchModule[] {
  return MODULES_BY_TEMPLATE[template]
    .filter((module) =>
      module.requiredPermissions.every((permission) => permissionKeys.has(permission)),
    )
    .map(({ requiredPermissions: _requiredPermissions, ...module }) => ({
      ...module,
      metrics: [],
      items: [],
    }))
}

function buildActions(
  template: WorkbenchTemplate,
  permissionKeys: ReadonlySet<string>,
): WorkbenchAction[] {
  if (
    template === 'finance' ||
    !permissionKeys.has(DEPARTURE_WRITE_ACTION_KEY)
  ) {
    return []
  }

  return [
    {
      key: 'create-departure',
      label: '新建发团',
      href: '/departure/new',
      requiredPermission: DEPARTURE_WRITE_ACTION_KEY,
      emphasis: template === 'coordinator' ? 'primary' : 'secondary',
    },
  ]
}

@Injectable()
export class WorkbenchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coordinatorWorkbenchService: CoordinatorWorkbenchService,
    private readonly coordinatorSettlementWorkbenchService: CoordinatorSettlementWorkbenchService,
    private readonly coordinatorTrendWorkbenchService: CoordinatorTrendWorkbenchService,
    private readonly organizationScaleWorkbenchService: OrganizationScaleWorkbenchService,
    private readonly organizationRiskWorkbenchService: OrganizationRiskWorkbenchService,
    private readonly financeReceivablesWorkbenchService: FinanceReceivablesWorkbenchService,
    private readonly financeFundsWorkbenchService: FinanceFundsWorkbenchService,
  ) {}

  async getSnapshot(userId: string, organizationId: string): Promise<WorkbenchSnapshot> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        deletedAt: null,
      },
      select: {
        isPlatformAdmin: true,
        organization: { select: { id: true, name: true } },
        roles: {
          select: {
            role: {
              select: {
                name: true,
                permissions: {
                  select: { permission: { select: { key: true } } },
                },
              },
            },
          },
        },
      },
    })

    if (!user || user.isPlatformAdmin) {
      throw new ForbiddenException('无权访问 Organization 工作台')
    }

    const roleNames = new Set(user.roles.map(({ role }) => role.name))
    const template = selectTemplate(roleNames)
    if (!template) {
      throw new ForbiddenException('当前 User 没有可用的工作台模板')
    }

    const permissionKeys = new Set(
      user.roles.flatMap(({ role }) =>
        role.permissions.map(({ permission }) => permission.key),
      ),
    )

    const asOf = new Date()
    const modules = buildModules(template, permissionKeys)
    if (template === 'organization_admin') {
      const organizationScaleIndex = modules.findIndex(
        (module) => module.key === 'organization-scale',
      )
      if (organizationScaleIndex >= 0) {
        modules[organizationScaleIndex] = await this.organizationScaleWorkbenchService.buildModule(
          organizationId,
          asOf,
        )
      }
      const organizationRiskIndex = modules.findIndex(
        (module) => module.key === 'organization-risk',
      )
      if (organizationRiskIndex >= 0) {
        modules[organizationRiskIndex] = await this.organizationRiskWorkbenchService.buildModule(
          organizationId,
          asOf,
        )
      }
    }
    if (template === 'finance') {
      const financeReceivablesIndex = modules.findIndex(
        (module) => module.key === 'finance-receivables',
      )
      if (financeReceivablesIndex >= 0) {
        modules[financeReceivablesIndex] =
          await this.financeReceivablesWorkbenchService.buildModule(organizationId, asOf)
      }
      const financeFundsIndex = modules.findIndex(
        (module) => module.key === 'finance-funds',
      )
      if (financeFundsIndex >= 0) {
        modules[financeFundsIndex] =
          await this.financeFundsWorkbenchService.buildModule(organizationId)
      }
    }
    if (template === 'coordinator') {
      const settlementSnapshot =
        await this.coordinatorSettlementWorkbenchService.loadSnapshot(organizationId)
      const coordinatorDeparturesIndex = modules.findIndex(
        (module) => module.key === 'coordinator-departures',
      )
      if (coordinatorDeparturesIndex >= 0) {
        modules[coordinatorDeparturesIndex] = await this.coordinatorWorkbenchService.buildModule(
          organizationId,
          asOf,
          settlementSnapshot.payableRows.length,
          settlementSnapshot.pendingCountByDepartureId,
        )
      }
      const coordinatorSettlementIndex = modules.findIndex(
        (module) => module.key === 'coordinator-settlement',
      )
      if (coordinatorSettlementIndex >= 0) {
        modules[coordinatorSettlementIndex] =
          this.coordinatorSettlementWorkbenchService.buildModule(settlementSnapshot)
      }
      const coordinatorTrendIndex = modules.findIndex(
        (module) => module.key === 'coordinator-trend',
      )
      if (coordinatorTrendIndex >= 0) {
        modules[coordinatorTrendIndex] = await this.coordinatorTrendWorkbenchService.buildModule(
          organizationId,
          asOf,
        )
      }
    }

    return {
      template,
      organization: user.organization,
      asOf: asOf.toISOString(),
      modules,
      actions: buildActions(template, permissionKeys),
    }
  }
}
