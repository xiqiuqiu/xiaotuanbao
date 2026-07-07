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
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { PartnersPage } from '@/features/partner/pages/PartnersPage'
import { DeparturesPage } from '@/features/departure/pages/DeparturesPage'
import { CreateDeparturePage } from '@/features/departure/pages/CreateDeparturePage'
import { DepartureDetailPage } from '@/features/departure/pages/DepartureDetailPage'
import { EmployeesPage } from '@/pages/system/EmployeesPage'
import { SuppliersPage } from '@/features/supplier/pages/SuppliersPage'
import { SupplierDetailPage } from '@/features/supplier/pages/SupplierDetailPage'
import { PartnerDetailPage } from '@/features/partner/pages/PartnerDetailPage'
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
  } => ({
    tab: typeof search.tab === 'string' ? search.tab : undefined,
    segmentId: typeof search.segmentId === 'string' ? search.segmentId : undefined,
  }),
  component: DepartureDetailPage,
})

const financeReceivableRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/finance/receivable',
  component: () => <PlaceholderPage title="应收管理" />,
})

const financePayableRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/finance/payable',
  component: () => <PlaceholderPage title="应付管理" />,
})

const financeTransactionsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/finance/transactions',
  component: () => <PlaceholderPage title="财务流水" />,
})

const financeVerificationRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/finance/verification',
  component: () => <PlaceholderPage title="核销管理" />,
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
