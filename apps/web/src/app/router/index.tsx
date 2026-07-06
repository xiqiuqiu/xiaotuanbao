import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  Outlet,
} from '@tanstack/react-router'
import { useAuthStore } from '@/app/store/auth.store'
import { AppLayout } from '@/layouts/AppLayout'
import { LoginPage } from '@/pages/LoginPage'
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'

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
  beforeLoad: () => {
    if (!useAuthStore.getState().isAuthenticated()) {
      throw redirect({ to: '/login', search: { redirect: location.pathname } })
    }
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
  component: () => <PlaceholderPage title="发团管理" />,
})

const itineraryRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/itinerary',
  component: () => <PlaceholderPage title="行程管理" />,
})

const resourceRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/resource',
  component: () => <PlaceholderPage title="资源管理" />,
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
  component: () => <PlaceholderPage title="客户/同行管理" />,
})

const supplierRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/supplier',
  component: () => <PlaceholderPage title="供应商管理" />,
})

const systemOrganizationRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/system/organization',
  component: () => <PlaceholderPage title="组织管理" />,
})

const systemUsersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/system/users',
  component: () => <PlaceholderPage title="员工管理" />,
})

const systemRolesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/system/roles',
  component: () => <PlaceholderPage title="角色权限" />,
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  appLayoutRoute.addChildren([
    indexRoute,
    departureRoute,
    itineraryRoute,
    resourceRoute,
    financeReceivableRoute,
    financePayableRoute,
    financeTransactionsRoute,
    financeVerificationRoute,
    partnerRoute,
    supplierRoute,
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
