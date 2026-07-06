export const env = {
  appName: import.meta.env.VITE_APP_NAME ?? '小团宝',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
  appEnv: import.meta.env.VITE_APP_ENV ?? 'development',
  isDev: import.meta.env.DEV,
} as const
