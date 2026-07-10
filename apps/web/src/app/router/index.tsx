import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  Outlet,
} from '@tanstack/react-router'
import { useAuthStore } from '@/app/store/auth.store'
import { ensureAuthenticatedSession } from '@/lib/auth/session'
import { AppLayout } from '@/layouts/AppLayout'
import { LoginPage } from '@/pages/LoginPage'
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PartnersPage } from '@/features/partner/pages/PartnersPage'
import { DeparturesPage } from '@/features/departure/pages/DeparturesPage'
import { CreateDeparturePage } from '@/features/departure/pages/CreateDeparturePage'
import { DepartureDetailPage } from '@/features/departure/pages/DepartureDetailPage'
import { EmployeesPage } from '@/pages/system/EmployeesPage'
import { SuppliersPage } from '@/features/supplier/pages/SuppliersPage'
import { SupplierDetailPage } from '@/features/supplier/pages/SupplierDetailPage'
import { PartnerDetailPage } from '@/features/partner/pages/PartnerDetailPage'
import { ReceivablesPage } from '@/features/finance/pages/ReceivablesPage'
import { PayablesPage } from '@/features/finance/pages/PayablesPage'
import { TransactionsPage } from '@/features/finance/pages/TransactionsPage'
import { VerificationsPage } from '@/features/finance/pages/VerificationsPage'
import { OrganizationPage } from '@/pages/system/OrganizationPage'
import { RolesPage } from '@/pages/system/RolesPage'

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: NotFoundPage,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated()) {
      throw redirect({ to: '/' })
    }
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

const indexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/',
  component: HomePage,
})

const departureRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/departure',
  component: DeparturesPage,
})

const departureNewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/departure/new',
  validateSearch: (search: Record<string, unknown>): { copyFrom?: string } => ({
    copyFrom: typeof search.copyFrom === 'string' ? search.copyFrom : undefined,
  }),
  component: CreateDeparturePage,
})

const departureDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/departure/$departureId',
  validateSearch: (search: Record<string, unknown>): {
    tab?: string
    segmentId?: string
    highlightSourceOrderId?: string
    highlightSegmentResourceId?: string
    direction?: string
    transactionNo?: string
    scheduleNo?: string
  } => {
    const direction = typeof search.direction === 'string' ? search.direction.trim() : ''
    const transactionNo =
      typeof search.transactionNo === 'string' ? search.transactionNo.trim() : ''
    const scheduleNo = typeof search.scheduleNo === 'string' ? search.scheduleNo.trim() : ''
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
      ...(direction ? { direction } : {}),
      ...(transactionNo ? { transactionNo } : {}),
      ...(scheduleNo ? { scheduleNo } : {}),
    }
  },
  component: DepartureDetailPage,
})

const financeReceivableRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/finance/receivable',
  component: ReceivablesPage,
})

const financePayableRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/finance/payable',
  component: PayablesPage,
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
  component: TransactionsPage,
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
  component: VerificationsPage,
})

const partnerRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/partner',
  component: PartnersPage,
})

const partnerDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/partner/$partnerId',
  component: PartnerDetailPage,
})

const supplierRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/supplier',
  component: SuppliersPage,
})

const supplierDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/supplier/$supplierId',
  component: SupplierDetailPage,
})

const systemOrganizationRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/system/organization',
  component: OrganizationPage,
})

const systemUsersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/system/users',
  component: EmployeesPage,
})

const systemRolesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/system/roles',
  component: RolesPage,
})

const routeTree = rootRoute.addChildren([
  loginRoute,
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
    systemRolesRoute,
  ]),
])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
