import { describe, expect, it } from 'vitest'
import { CAPABILITIES, type CapabilityId } from '@xiaotuanbao/shared'

/**
 * 前端「写调用 → gating」静态守卫（配合 ADR-0023 与 @xiaotuanbao/shared 能力单一事实源）。
 *
 * 后端权限矩阵测试 + 前端契约测试能机械拦截「改错 key / 漏挂 guard / 前后端 drift」，
 * 但对**全新加的、完全没做任何 gating 的写按钮**无能为力（没有 key 可比对）。本测试补这块缺口：
 *
 *  0) 所有写请求都收敛在 services/ 层（组件里不得裸写 request.post/put/patch/delete）；
 *  1) 每个写 service 函数都必须在下表登记（新增写接口 → 强制归类，评审可见）；
 *  2) 登记的 gating 归类必须与后端要求的权限 key 自洽（防止把财务写口径当成菜单级）；
 *  3) 任何**直接**触发能力级写操作的模块（import 写 service 或 mutation hook）都必须具备
 *     gating 意识（引用 canEdit/readOnly/能力 helper 之类）；否则极可能是「UI 能点、API 403」。
 *
 * 说明：本测试是静态近似，无法追踪 props 深传后按钮是否真的连到了 gate；它兜的是
 * 「完全没有 gating 意识」这一最危险的类别。少数「文件内无 token 但由祖先 gate 覆盖」的
 * 合法情形在 GATING_AWARENESS_ALLOWLIST 里逐条登记理由。
 */

type WriteGating =
  | CapabilityId // 能力级：需要按钮级 gating
  | 'menuGated' // 菜单级：能进入页面 ⟺ 后端放行，无需按钮级 gating
  | 'platform' // 平台守卫：PlatformAdminGuard 覆盖
  | 'public' // 公开/仅认证

interface WriteServiceSpec {
  /** gating 归类。 */
  gating: WriteGating
  /** 该端点后端 @RequireMenu 校验的权限 key（平台/公开为 null）。 */
  endpointKey: string | null
}

/**
 * 全部写 service 函数 → gating 归类 + 后端权限 key（权威快照见
 * apps/api/test/__snapshots__/permission-matrix.e2e-spec.ts.snap）。
 * 新增写 service 未登记 → 测试 1 变红。
 */
const WRITE_SERVICES: Record<string, WriteServiceSpec> = {
  // ---- 发团编辑（departure:write）----
  createDeparture: { gating: 'departureWrite', endpointKey: 'departure:write' },
  copyDeparture: { gating: 'departureWrite', endpointKey: 'departure:write' },
  updateDeparture: { gating: 'departureWrite', endpointKey: 'departure:write' },
  transitionDeparture: { gating: 'departureWrite', endpointKey: 'departure:write' },
  closeDeparture: { gating: 'departureWrite', endpointKey: 'departure:write' },
  unarchiveDeparture: { gating: 'departureWrite', endpointKey: 'departure:write' },
  purgeDeparture: { gating: 'departureWrite', endpointKey: 'departure:write' },
  createSegment: { gating: 'departureWrite', endpointKey: 'departure:write' },
  generateDailySegments: { gating: 'departureWrite', endpointKey: 'departure:write' },
  updateSegment: { gating: 'departureWrite', endpointKey: 'departure:write' },
  deleteSegment: { gating: 'departureWrite', endpointKey: 'departure:write' },
  createSegmentResource: { gating: 'departureWrite', endpointKey: 'departure:write' },
  updateSegmentResource: { gating: 'departureWrite', endpointKey: 'departure:write' },
  deleteSegmentResource: { gating: 'departureWrite', endpointKey: 'departure:write' },
  createDepartureResource: { gating: 'departureWrite', endpointKey: 'departure:write' },
  updateDepartureResource: { gating: 'departureWrite', endpointKey: 'departure:write' },
  deleteDepartureResource: { gating: 'departureWrite', endpointKey: 'departure:write' },
  createIncomeRecord: { gating: 'departureWrite', endpointKey: 'departure:write' },
  updateIncomeRecord: { gating: 'departureWrite', endpointKey: 'departure:write' },
  deleteIncomeRecord: { gating: 'departureWrite', endpointKey: 'departure:write' },
  createSourceOrder: { gating: 'departureWrite', endpointKey: 'departure:write' },
  updateSourceOrder: { gating: 'departureWrite', endpointKey: 'departure:write' },
  deleteSourceOrder: { gating: 'departureWrite', endpointKey: 'departure:write' },
  createSourceOrderGuest: { gating: 'departureWrite', endpointKey: 'departure:write' },
  updateSourceOrderGuest: { gating: 'departureWrite', endpointKey: 'departure:write' },
  deleteSourceOrderGuest: { gating: 'departureWrite', endpointKey: 'departure:write' },
  saveRouteTemplateFromDeparture: { gating: 'departureWrite', endpointKey: 'departure:write' },
  deleteRouteTemplate: { gating: 'departureWrite', endpointKey: 'departure:write' },
  saveDepartureCreationDraft: { gating: 'departureWrite', endpointKey: 'departure:write' },
  confirmAiCreateTask: { gating: 'departureWrite', endpointKey: 'departure:write' },
  startAiCreateAssistSession: { gating: 'departureWrite', endpointKey: 'departure:write' },
  sendAiConversationMessage: { gating: 'departureWrite', endpointKey: 'departure:write' },
  patchAiReviewPackage: { gating: 'departureWrite', endpointKey: 'departure:write' },
  confirmAiReviewPackage: { gating: 'departureWrite', endpointKey: 'departure:write' },
  rejectAiReviewPackage: { gating: 'departureWrite', endpointKey: 'departure:write' },
  // 资源应付作废：路径在 /finance 下，但后端要 departure:write（作废属发团编辑）。
  voidResourcePayable: { gating: 'departureWrite', endpointKey: 'departure:write' },

  // ---- 财务账款操作（/finance/*）----
  updateReceivable: { gating: 'financeMutate', endpointKey: '/finance/receivable' },
  updatePayable: { gating: 'financeMutate', endpointKey: '/finance/payable' },
  confirmCollection: { gating: 'financeMutate', endpointKey: '/finance/receivable' },
  confirmPayment: { gating: 'financeMutate', endpointKey: '/finance/payable' },
  cancelSchedule: { gating: 'financeMutate', endpointKey: '/finance/receivable' },
  reopenSchedule: { gating: 'financeMutate', endpointKey: '/finance/receivable' },
  adjustScheduleAmount: { gating: 'financeMutate', endpointKey: '/finance/receivable' },
  createTransaction: { gating: 'financeMutate', endpointKey: '/finance/transactions' },
  updateTransaction: { gating: 'financeMutate', endpointKey: '/finance/transactions' },
  voidTransaction: { gating: 'financeMutate', endpointKey: '/finance/transactions' },
  acknowledgeTransactionSourceAmountChange: {
    gating: 'financeMutate',
    endpointKey: '/finance/transactions',
  },
  createVerification: { gating: 'financeMutate', endpointKey: '/finance/verification' },
  cancelVerification: { gating: 'financeMutate', endpointKey: '/finance/verification' },

  // ---- 合作伙伴 / 供应商目录维护 ----
  createPartner: { gating: 'partnerWrite', endpointKey: 'partner:write' },
  updatePartner: { gating: 'partnerWrite', endpointKey: 'partner:write' },
  archivePartner: { gating: 'partnerWrite', endpointKey: 'partner:write' },
  restorePartner: { gating: 'partnerWrite', endpointKey: 'partner:write' },
  createSupplier: { gating: 'supplierWrite', endpointKey: 'supplier:write' },
  updateSupplier: { gating: 'supplierWrite', endpointKey: 'supplier:write' },
  archiveSupplier: { gating: 'supplierWrite', endpointKey: 'supplier:write' },
  restoreSupplier: { gating: 'supplierWrite', endpointKey: 'supplier:write' },

  // ---- 产品中心维护 ----
  createProduct: { gating: 'productWrite', endpointKey: 'product:write' },
  updateProduct: { gating: 'productWrite', endpointKey: 'product:write' },
  replaceProductFeatures: { gating: 'productWrite', endpointKey: 'product:write' },
  applyBookingNoticeTemplate: { gating: 'productWrite', endpointKey: 'product:write' },
  deleteProduct: { gating: 'productWrite', endpointKey: 'product:write' },
  updateProductSpec: { gating: 'productWrite', endpointKey: 'product:write' },
  createProductSchedule: { gating: 'productWrite', endpointKey: 'product:write' },
  updateProductSchedule: { gating: 'productWrite', endpointKey: 'product:write' },
  createProductImportSession: { gating: 'productWrite', endpointKey: 'product:write' },
  confirmProductImportSession: { gating: 'productWrite', endpointKey: 'product:write' },
  // 组织须知模板由企业管理员在组织管理维护。
  createBookingNoticeTemplate: { gating: 'menuGated', endpointKey: '/system/organization' },
  updateBookingNoticeTemplate: { gating: 'menuGated', endpointKey: '/system/organization' },
  deleteBookingNoticeTemplate: { gating: 'menuGated', endpointKey: '/system/organization' },

  // ---- 菜单级：提交应收/应付挂 /departure（发团可见者皆可）----
  generatePayable: { gating: 'menuGated', endpointKey: '/departure' },
  generateDeparturePayable: { gating: 'menuGated', endpointKey: '/departure' },
  generatePayablesForSegment: { gating: 'menuGated', endpointKey: '/departure' },
  generateReceivables: { gating: 'menuGated', endpointKey: '/departure' },
  generateReceivablesForDeparture: { gating: 'menuGated', endpointKey: '/departure' },
  settleByActualCollection: { gating: 'menuGated', endpointKey: '/departure' },
  // 员工管理挂 /system/users（能进入系统页 ⟺ 可调）。
  createEmployee: { gating: 'menuGated', endpointKey: '/system/users' },
  updateEmployee: { gating: 'menuGated', endpointKey: '/system/users' },
  disableEmployee: { gating: 'menuGated', endpointKey: '/system/users' },

  // ---- 平台守卫 ----
  createPlatformOrganization: { gating: 'platform', endpointKey: null },
  updatePlatformOrganization: { gating: 'platform', endpointKey: null },
  updatePlatformOrganizationBusinessPrefix: { gating: 'platform', endpointKey: null },
  disablePlatformOrganization: { gating: 'platform', endpointKey: null },
  enablePlatformOrganization: { gating: 'platform', endpointKey: null },

  // ---- 公开 / 仅认证 ----
  login: { gating: 'public', endpointKey: null },
  logout: { gating: 'public', endpointKey: null },
}

/** 需要按钮级 gating 的能力归类。 */
const CAPABILITY_GATINGS = new Set<WriteGating>([
  'departureWrite',
  'partnerWrite',
  'supplierWrite',
  'productWrite',
  'financeMutate',
])

/**
 * mutation hooks：封装写 service，自身不做 gating（gating 在其消费方）。
 * 视作「触发点」——其消费方须具备 gating 意识；其定义文件本身归入写来源、豁免消费方检查。
 */
const MUTATION_HOOKS: Record<string, string> = {
  usePaymentScheduleMutations:
    '/src/features/finance/hooks/usePaymentScheduleMutations.ts',
  useTransactionWorkspaceMutations:
    '/src/features/finance/hooks/useTransactionWorkspaceMutations.ts',
  useVerificationWorkspaceMutations:
    '/src/features/finance/hooks/useVerificationWorkspaceMutations.ts',
  useDepartureHeaderActions:
    '/src/features/departure/components/useDepartureHeaderActions.ts',
  useSourceOrdersTabMutations:
    '/src/features/departure/hooks/useSourceOrdersTabMutations.tsx',
  useProductDetailMutations: '/src/features/product/hooks/useProductDetailMutations.ts',
}

/** gating 意识 token：出现其一即认为该模块「知道要 gating」。刻意不含泛化的 disabled/loading。 */
const GATING_TOKEN =
  /\b(canEditDeparture|canEditPartner|canEditSupplier|canEditProduct|canMutateFinance|canPerformCapability|canEdit|canWritePartner|canWriteSupplier|canWrite|readOnly|financeReadOnly|amountReadOnly|mutationLocked|resourceEditable)\b/

/**
 * 「文件内无 gating token 但由祖先 gate 覆盖」的合法豁免，逐条登记理由。
 * 若某文件不再触发写操作或已自带 token，其条目会被「豁免表保鲜」测试判为过期而变红。
 */
const GATING_AWARENESS_ALLOWLIST: Record<string, string> = {
  '/src/features/departure/components/CreateDepartureWizard.tsx':
    '新建/复制发团属 departure:write；本向导仅由 CreateDeparturePage 渲染，后者已做页面级 canEditDeparture 403，财务无法进入',
  '/src/features/ai-assist/useAiCreateAssistBootstrap.ts':
    '协助会话由 CreateDepartureWizard 调用，页面级 canEditDeparture 已挡住无写权限角色',
  '/src/features/ai-assist/AiCreateAssistChat.tsx':
    '发送会话消息由 CreateDepartureWizard 挂载，页面级 canEditDeparture 已挡住无写权限角色',
  '/src/features/departure/components/CreateDepartureStepRoute.tsx':
    '删除常用路线属 departure:write；整个新建向导由 CreateDeparturePage 页面级 canEditDeparture 挡住，财务无法进入',
  '/src/features/departure/components/SaveAsRouteTemplateModal.tsx':
    '保存为常用路线仅从 useDepartureHeaderActions 中 canWrite gate 的菜单项打开',
}

const SOURCE_FILES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const isTestFile = (path: string) => /\.test\.tsx?$/.test(path)
const isServiceFile = (path: string) => path.startsWith('/src/services/')

/** 从服务文件中抽出「执行了 mutating request」的导出函数名。 */
function extractWriteFunctions(source: string): string[] {
  const fnRegex = /export\s+async\s+function\s+(\w+)/g
  const matches = [...source.matchAll(fnRegex)]
  const names: string[] = []
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index ?? 0
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? source.length) : source.length
    const body = source.slice(start, end)
    if (/\brequest\.(post|put|patch|delete)\b/.test(body)) {
      names.push(matches[i][1])
    }
  }
  return names
}

/** 解析 `import { a, b as c } from '...'` 的具名导入标识符集合。 */
function getNamedImports(source: string): Set<string> {
  const names = new Set<string>()
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"][^'"]+['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    for (const part of m[1].split(',')) {
      const id = part.trim().split(/\s+as\s+/)[0]?.trim()
      if (id) names.add(id)
    }
  }
  return names
}

describe('写调用 → gating 静态守卫 (ADR-0023)', () => {
  it('0) 所有 mutating 请求都收敛在 services/ 层（组件不得裸写 request.post/put/patch/delete）', () => {
    const offenders = Object.entries(SOURCE_FILES)
      .filter(([path]) => !isServiceFile(path) && !isTestFile(path))
      .filter(([, src]) => /\b(request|apiClient)\.(post|put|patch|delete)\b/.test(src))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })

  it('1) 每个写 service 函数都已在 WRITE_SERVICES 登记（新增写接口须归类）', () => {
    const detected = new Set<string>()
    for (const [path, src] of Object.entries(SOURCE_FILES)) {
      if (!isServiceFile(path) || isTestFile(path)) continue
      for (const name of extractWriteFunctions(src)) detected.add(name)
    }
    const registered = new Set(Object.keys(WRITE_SERVICES))

    const unregistered = [...detected].filter((n) => !registered.has(n)).sort()
    const stale = [...registered].filter((n) => !detected.has(n)).sort()
    expect({ unregistered, stale }).toEqual({ unregistered: [], stale: [] })
  })

  it('2) 登记的 gating 归类与后端权限 key 自洽', () => {
    const mismatches: string[] = []
    for (const [fn, spec] of Object.entries(WRITE_SERVICES)) {
      if (CAPABILITY_GATINGS.has(spec.gating)) {
        const capabilityKey = CAPABILITIES[spec.gating as CapabilityId].requiredKey
        if (spec.gating === 'financeMutate') {
          // 财务账款端点分属四个 /finance/* menu key，统一以 /finance/ 前缀校验。
          if (!spec.endpointKey?.startsWith('/finance/')) {
            mismatches.push(`${fn}: financeMutate 但 endpointKey=${spec.endpointKey}`)
          }
        } else if (spec.endpointKey !== capabilityKey) {
          mismatches.push(
            `${fn}: gating=${spec.gating}(key=${capabilityKey}) 但 endpointKey=${spec.endpointKey}`,
          )
        }
      } else if (spec.gating === 'menuGated') {
        if (!spec.endpointKey?.startsWith('/')) {
          mismatches.push(`${fn}: menuGated 但 endpointKey 非菜单 key=${spec.endpointKey}`)
        }
      } else if (spec.endpointKey !== null) {
        mismatches.push(`${fn}: gating=${spec.gating} 应无 endpointKey，实际=${spec.endpointKey}`)
      }
    }
    expect(mismatches).toEqual([])
  })

  it('3) 每个直接触发能力级写操作的模块都具备 gating 意识', () => {
    const triggers = new Set<string>([
      ...Object.entries(WRITE_SERVICES)
        .filter(([, spec]) => CAPABILITY_GATINGS.has(spec.gating))
        .map(([fn]) => fn),
      ...Object.keys(MUTATION_HOOKS),
    ])

    const writeSourceFiles = new Set<string>([
      ...Object.keys(SOURCE_FILES).filter(isServiceFile),
      ...Object.values(MUTATION_HOOKS),
    ])

    const offenders: string[] = []
    for (const [path, src] of Object.entries(SOURCE_FILES)) {
      if (isTestFile(path) || writeSourceFiles.has(path)) continue
      const used = [...getNamedImports(src)].filter((name) => triggers.has(name))
      if (used.length === 0) continue
      if (GATING_TOKEN.test(src)) continue
      if (path in GATING_AWARENESS_ALLOWLIST) continue
      offenders.push(`${path} → ${used.sort().join(', ')}`)
    }
    expect(offenders).toEqual([])
  })

  it('保鲜：MUTATION_HOOKS 与豁免表路径均存在且仍需豁免', () => {
    for (const hookPath of Object.values(MUTATION_HOOKS)) {
      expect(SOURCE_FILES[hookPath], `mutation hook 路径已失效: ${hookPath}`).toBeDefined()
    }
    const triggers = new Set<string>([
      ...Object.entries(WRITE_SERVICES)
        .filter(([, spec]) => CAPABILITY_GATINGS.has(spec.gating))
        .map(([fn]) => fn),
      ...Object.keys(MUTATION_HOOKS),
    ])
    for (const path of Object.keys(GATING_AWARENESS_ALLOWLIST)) {
      const src = SOURCE_FILES[path]
      expect(src, `豁免文件已不存在，请清理: ${path}`).toBeDefined()
      if (!src) continue
      const used = [...getNamedImports(src)].filter((name) => triggers.has(name))
      expect(used.length, `豁免文件已不再触发写操作，请清理: ${path}`).toBeGreaterThan(0)
      expect(
        GATING_TOKEN.test(src),
        `豁免文件已自带 gating token，无需豁免，请清理: ${path}`,
      ).toBe(false)
    }
  })
})
