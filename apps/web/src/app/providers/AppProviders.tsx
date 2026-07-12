import { App, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import type { PropsWithChildren } from 'react'
import { queryClient } from '@/lib/query/client'
import { router } from '@/app/router'

const theme = {
  token: {
    colorPrimary: '#1677ff',
    borderRadius: 6,
  },
}

function Providers({ children }: PropsWithChildren) {
  return (
    <ConfigProvider locale={zhCN} theme={theme}>
      <App>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </App>
    </ConfigProvider>
  )
}

export function AppProviders() {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  )
}
