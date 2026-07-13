import { App, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import type { PropsWithChildren } from 'react'
import { queryClient } from '@/lib/query/client'
import { router } from '@/app/router'

const theme = {
  cssVar: {},
  token: {
    colorPrimary: '#1677FF',
    colorText: '#1F1F1F',
    colorTextSecondary: '#595959',
    colorTextTertiary: '#8C8C8C',
    colorBgLayout: '#F5F5F5',
    colorBgContainer: '#FFFFFF',
    colorFillAlter: '#FAFAFA',
    colorBorder: '#D9D9D9',
    colorBorderSecondary: '#F0F0F0',
    colorSuccess: '#52C41A',
    colorWarning: '#FAAD14',
    colorError: '#FF4D4F',
    fontSize: 14,
    fontSizeHeading4: 20,
    fontSizeHeading5: 16,
    fontWeightStrong: 600,
    controlHeight: 32,
    borderRadius: 6,
    borderRadiusLG: 8,
    wireframe: false,
  },
  components: {
    Layout: {
      bodyBg: '#F5F5F5',
      headerBg: '#FFFFFF',
      headerHeight: 64,
      headerPadding: '0 16px',
      lightSiderBg: '#FFFFFF',
    },
    Card: {
      bodyPadding: 24,
      headerHeight: 48,
    },
    Table: {
      headerBg: '#FAFAFA',
      headerColor: '#1F1F1F',
      headerBorderRadius: 8,
    },
    Menu: {
      itemBorderRadius: 6,
      itemMarginInline: 8,
    },
    Tabs: {
      inkBarColor: '#1677FF',
    },
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
