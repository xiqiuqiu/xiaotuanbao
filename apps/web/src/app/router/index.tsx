import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import {
  ensureAnonymousSession,
  ensureAuthenticatedSession,
  ensurePlatformSession,
} from '@/lib/auth/session'
import { RouteErrorState } from '@/components/RouteErrorState'
import { RoutePendingState } from '@/components/RoutePendingState'
import { AppLayout } from '@/layouts/AppLayout'
import { PlatformLayout } from '@/layouts/PlatformLayout'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { parseDepartureListSearch } from '@/features/departure/utils/departure-list-search'
import { parseReceivableListSearch } from '@/features/finance/utils/receivable-list-search'
import { parsePayableListSearch } from '@/features/finance/utils/payable-list-search'
import { parseProductListSearch } from '@/features/product/utils/product-list-search'

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: NotFoundPage,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  component: LoginPage,
  beforeLoad: async () => {
    await ensureAnonymousSession()
  },
})

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: AppLayout,
  beforeLoad: async ({ location }) => {
    await ensureAuthenticatedSession(location.href)
  },
})

const platformLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/platform',
  component: PlatformLayout,
  beforeLoad: async ({ location }) => {
    await ensurePlatformSession(location.pathname)
  },
})

const platformIndexRoute = createRoute({
  getParentRoute: () => platformLayoutRoute,
  path: '/',
  component: lazyRouteComponent(
    () => import('@/pages/platform/PlatformHomePage'),
    'PlatformHomePage',
  ),
})

const platformOrganizationsRoute = createRoute({
  getParentRoute: () => platformLayoutRoute,
  path: '/organizations',
  component: lazyRouteComponent(
    () => import('@/pages/platform/PlatformOrganizationsPage'),
    'PlatformOrganizationsPage',
  ),
})

const platformOrganizationDetailRoute = createRoute({
  getParentRoute: () => platformLayoutRoute,
  path: '/organizations/$organizationId',
  component: lazyRouteComponent(
    () => import('@/pages/platform/PlatformOrganizationDetailPage'),
    'PlatformOrganizationDetailPage',
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/',
  component: lazyRouteComponent(() => import('@/pages/HomePage'), 'HomePage'),
})

const departureRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/departure',
  validateSearch: parseDepartureListSearch,
  component: lazyRouteComponent(
    () => import('@/features/departure/pages/DeparturesPage'),
    'DeparturesPage',
  ),
})

const departureNewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/departure/new',
  validateSearch: (search: Record<string, unknown>): { copyFrom?: string } => ({
    copyFrom: typeof search.copyFrom === 'string' ? search.copyFrom : undefined,
  }),
  component: lazyRouteComponent(
    () => import('@/features/departure/pages/CreateDeparturePage'),
    'CreateDeparturePage',
  ),
})

const pendingReceivableSourceOrdersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/source-orders',
  validateSearch: (search: Record<string, unknown>): {
    receivableGeneration: 'not_generated'
    page?: number
    pageSize?: number
  } => ({
    receivableGeneration: 'not_generated',
    page: typeof search.page === 'number' ? search.page : undefined,
    pageSize: typeof search.pageSize === 'number' ? search.pageSize : undefined,
  }),
  component: lazyRouteComponent(
    () => import('@/features/departure/pages/PendingReceivableSourceOrdersPage'),
    'PendingReceivableSourceOrdersPage',
  ),
})

const departureDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/departure/$departureId',
  validateSearch: (search: Record<string, unknown>): {
    tab?: string
    segmentId?: string
    highlightSourceOrderId?: string
    highlightSegmentResourceId?: string
    highlightDepartureResourceId?: string
    counterpartyKeyword?: string
    sourceId?: string
    direction?: string
    transactionNo?: string
    scheduleNo?: string
    listReturn?: string
  } => {
    const direction = typeof search.direction === 'string' ? search.direction.trim() : ''
    const transactionNo =
      typeof search.transactionNo === 'string' ? search.transactionNo.trim() : ''
    const scheduleNo = typeof search.scheduleNo === 'string' ? search.scheduleNo.trim() : ''
    const counterpartyKeyword =
      typeof search.counterpartyKeyword === 'string' ? search.counterpartyKeyword.trim() : ''
    const sourceId = typeof search.sourceId === 'string' ? search.sourceId.trim() : ''
    const listReturn =
      typeof search.listReturn === 'string' && search.listReturn.trim()
        ? search.listReturn.trim()
        : undefined
    return {
      tab: typeof search.tab === 'string' ? search.tab : undefined,
      segmentId: typeof search.segmentId === 'string' ? search.segmentId : undefined,
      highlightSourceOrderId:
        typeof search.highlightSourceOrderId === 'string'
          ? search.highlightSourceOrderId
          : undefined,
      highlightSegmentResourceId:
        typeof search.highlightSegmentResourceId === 'string'
          ? search.highlightSegmentResourceId
          : undefined,
      highlightDepartureResourceId:
        typeof search.highlightDepartureResourceId === 'string'
          ? search.highlightDepartureResourceId
          : undefined,
      ...(counterpartyKeyword ? { counterpartyKeyword } : {}),
      ...(sourceId ? { sourceId } : {}),
      ...(direction ? { direction } : {}),
      ...(transactionNo ? { transactionNo } : {}),
      ...(scheduleNo ? { scheduleNo } : {}),
      ...(listReturn ? { listReturn } : {}),
    }
  },
  component: lazyRouteComponent(
    () => import('@/features/departure/pages/DepartureDetailPage'),
    'DepartureDetailPage',
  ),
})

const financeReceivableRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/finance/receivable',
  validateSearch: parseReceivableListSearch,
  component: lazyRouteComponent(
    () => import('@/features/finance/pages/ReceivablesPage'),
    'ReceivablesPage',
  ),
})

const financePayableRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/finance/payable',
  validateSearch: parsePayableListSearch,
  component: lazyRouteComponent(
    () => import('@/features/finance/pages/PayablesPage'),
    'PayablesPage',
  ),
})

/** 旧独立清单页书签兼容：统一落到发团列表筛选。 */
const accountGenerationGapsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/departure/account-generation-gaps',
  validateSearch: (search: Record<string, unknown>): {
    generationKind?: 'receivable' | 'payable'
  } => ({
    generationKind:
      search.generationKind === 'receivable' || search.generationKind === 'payable'
        ? search.generationKind
        : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: '/departure',
      search: {
        accountGenerationGap: search.generationKind ?? 'any',
      },
    })
  },
})

const financeTransactionsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/finance/transactions',
  validateSearch: (search: Record<string, unknown>): {
    departureId?: string
    direction?: string
    status?: string
    pendingSettlement?: string
    transactionNo?: string
  } => {
    const departureId = typeof search.departureId === 'string' ? search.departureId.trim() : ''
    const direction = typeof search.direction === 'string' ? search.direction.trim() : ''
    const status = typeof search.status === 'string' ? search.status.trim() : ''
    const pendingSettlement =
      typeof search.pendingSettlement === 'string' ? search.pendingSettlement.trim() : ''
    const transactionNo =
      typeof search.transactionNo === 'string' ? search.transactionNo.trim() : ''
    return {
      ...(departureId ? { departureId } : {}),
      ...(direction ? { direction } : {}),
      ...(status ? { status } : {}),
      ...(pendingSettlement ? { pendingSettlement } : {}),
      ...(transactionNo ? { transactionNo } : {}),
    }
  },
  component: lazyRouteComponent(
    () => import('@/features/finance/pages/TransactionsPage'),
    'TransactionsPage',
  ),
})

const financeVerificationRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/finance/verification',
  validateSearch: (search: Record<string, unknown>): { transactionNo?: string; scheduleNo?: string } => {
    const transactionNo = typeof search.transactionNo === 'string' ? search.transactionNo.trim() : ''
    if (transactionNo) {
      return { transactionNo }
    }
    const scheduleNo = typeof search.scheduleNo === 'string' ? search.scheduleNo.trim() : ''
    if (scheduleNo) {
      return { scheduleNo }
    }
    return {}
  },
  component: lazyRouteComponent(
    () => import('@/features/finance/pages/VerificationsPage'),
    'VerificationsPage',
  ),
})

const partnerRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/partner',
  component: lazyRouteComponent(
    () => import('@/features/partner/pages/PartnersPage'),
    'PartnersPage',
  ),
})

const partnerDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/partner/$partnerId',
  component: lazyRouteComponent(
    () => import('@/features/partner/pages/PartnerDetailPage'),
    'PartnerDetailPage',
  ),
})

const supplierRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/supplier',
  component: lazyRouteComponent(
    () => import('@/features/supplier/pages/SuppliersPage'),
    'SuppliersPage',
  ),
})

const supplierDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/supplier/$supplierId',
  component: lazyRouteComponent(
    () => import('@/features/supplier/pages/SupplierDetailPage'),
    'SupplierDetailPage',
  ),
})

const productRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/product',
  validateSearch: parseProductListSearch,
  component: lazyRouteComponent(
    () => import('@/features/product/pages/ProductsPage'),
    'ProductsPage',
  ),
})

const productImportRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/product/import/$sessionId',
  component: lazyRouteComponent(
    () => import('@/features/product/pages/ProductImportConfirmPage'),
    'ProductImportConfirmPage',
  ),
})

const productDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/product/$productId',
  component: lazyRouteComponent(
    () => import('@/features/product/pages/ProductDetailPage'),
    'ProductDetailPage',
  ),
})

const systemOrganizationRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/system/organization',
  component: lazyRouteComponent(
    () => import('@/pages/system/OrganizationPage'),
    'OrganizationPage',
  ),
})

const systemUsersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/system/users',
  component: lazyRouteComponent(
    () => import('@/pages/system/EmployeesPage'),
    'EmployeesPage',
  ),
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  platformLayoutRoute.addChildren([
    platformIndexRoute,
    platformOrganizationsRoute,
    platformOrganizationDetailRoute,
  ]),
  appLayoutRoute.addChildren([
    indexRoute,
    departureRoute,
    departureNewRoute,
    pendingReceivableSourceOrdersRoute,
    accountGenerationGapsRoute,
    departureDetailRoute,
    financeReceivableRoute,
    financePayableRoute,
    financeTransactionsRoute,
    financeVerificationRoute,
    partnerRoute,
    partnerDetailRoute,
    supplierRoute,
    supplierDetailRoute,
    productRoute,
    productImportRoute,
    productDetailRoute,
    systemOrganizationRoute,
    systemUsersRoute,
  ]),
])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPendingComponent: RoutePendingState,
  defaultErrorComponent: RouteErrorState,
  defaultOnCatch: (error) => {
    console.error('[router] uncaught render error', error)
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
