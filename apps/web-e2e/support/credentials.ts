export type E2eUser = {
  username: string
  password: string
  displayName: string
}

export const adminUser: E2eUser = {
  username: process.env.WEB_E2E_ADMIN_USER ?? 'mazong',
  password: process.env.WEB_E2E_ADMIN_PASSWORD ?? 'admin123',
  displayName: process.env.WEB_E2E_ADMIN_NAME ?? '马总',
}

export const coordinatorUser: E2eUser = {
  username: process.env.WEB_E2E_COORDINATOR_USER ?? 'wangjie',
  password: process.env.WEB_E2E_COORDINATOR_PASSWORD ?? 'admin123',
  displayName: process.env.WEB_E2E_COORDINATOR_NAME ?? '王姐',
}
