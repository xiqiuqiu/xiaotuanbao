import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
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

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: NotFoundPage,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
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
    await ensureAuthenticatedSession(location.pathname)
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

const departureDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/departure/$departureId',
  validateSearch: (search: Record<string, unknown>): {
    tab?: string
    segmentId?: string
    highlightSourceOrderId?: string
    highlightSegmentResourceId?: string
    counterpartyKeyword?: string
    direction?: string
    transactionNo?: string
    scheduleNo?: string
  } => {
    const direction = typeof search.direction === 'string' ? search.direction.trim() : ''
    const transactionNo =
      typeof search.transactionNo === 'string' ? search.transactionNo.trim() : ''
    const scheduleNo = typeof search.scheduleNo === 'string' ? search.scheduleNo.trim() : ''
    const counterpartyKeyword =
      typeof search.counterpartyKeyword === 'string' ? search.counterpartyKeyword.trim() : ''
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
      ...(counterpartyKeyword ? { counterpartyKeyword } : {}),
      ...(direction ? { direction } : {}),
      ...(transactionNo ? { transactionNo } : {}),
      ...(scheduleNo ? { scheduleNo } : {}),
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
  component: lazyRouteComponent(
    () => import('@/features/finance/pages/ReceivablesPage'),
    'ReceivablesPage',
  ),
})

const financePayableRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/finance/payable',
  component: lazyRouteComponent(
    () => import('@/features/finance/pages/PayablesPage'),
    'PayablesPage',
  ),
})

const financeTransactionsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/finance/transactions',
  validateSearch: (search: Record<string, unknown>): {
    departureId?: string
    direction?: string
  } => {
    const departureId = typeof search.departureId === 'string' ? search.departureId.trim() : ''
    const direction = typeof search.direction === 'string' ? search.direction.trim() : ''
    return {
      ...(departureId ? { departureId } : {}),
      ...(direction ? { direction } : {}),
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
    departureDetailRoute,
    financeReceivableRoute,
    financePayableRoute,
    financeTransactionsRoute,
    financeVerificationRoute,
    partnerRoute,
    partnerDetailRoute,
    supplierRoute,
    supplierDetailRoute,
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
