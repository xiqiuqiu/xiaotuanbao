import { Outlet } from '@tanstack/react-router'
import { Layout } from 'antd'
import { MainLayout } from '@/layouts/MainLayout'

export function AppLayout() {
  return (
    <MainLayout>
      <Layout.Content className="app-content">
        <Outlet />
      </Layout.Content>
    </MainLayout>
  )
}
