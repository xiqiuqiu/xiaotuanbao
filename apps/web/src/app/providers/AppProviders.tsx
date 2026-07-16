import { App, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import type { PropsWithChildren } from 'react'
import { queryClient } from '@/lib/query/client'
import { router } from '@/app/router'

// DatePicker/Calendar 的月份、星期等文案依赖 dayjs locale；与 ConfigProvider zhCN 配套。
dayjs.locale('zh-cn')

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
    // DESIGN.md Elevation - lock antd motion scale
    motionDurationFast: '0.1s',
    motionDurationMid: '0.2s',
    motionDurationSlow: '0.3s',
    // Same curve as custom CSS: var(--ant-motion-ease-out-quint, ...)
    motionEaseOutQuint: 'cubic-bezier(0.23, 1, 0.32, 1)',
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
