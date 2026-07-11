import axios, { type AxiosError, type AxiosRequestConfig } from 'axios'
import { message } from 'antd'
import { env } from '@/config/env'
import { useAuthStore } from '@/app/store/auth.store'
import type { ApiResponse } from '@/types/api'

export class ApiError extends Error {
  constructor(
    message: string,
    public code: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const http = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
})

http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  const method = config.method?.toUpperCase()
  if (
    config.url?.startsWith('/finance/') &&
    method &&
    ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) &&
    !config.headers.has('Idempotency-Key')
  ) {
    config.headers.set('Idempotency-Key', crypto.randomUUID())
  }
  return config
})

http.interceptors.response.use(
  (response) => {
    const payload = response.data as ApiResponse

    if (payload && typeof payload.code === 'number') {
      if (payload.code !== 0) {
        return Promise.reject(new ApiError(payload.message || '请求失败', payload.code))
      }
      return payload.data
    }

    return response.data
  },
  (error: AxiosError<ApiResponse>) => {
    const status = error.response?.status
    const apiMessage = error.response?.data?.message

    if (status === 401) {
      useAuthStore.getState().logout()
      message.error('登录已过期，请重新登录')
      window.location.href = '/login'
      return Promise.reject(error)
    }

    const errorMessage = apiMessage || error.message || '网络异常，请稍后重试'
    message.error(errorMessage)
    return Promise.reject(error)
  },
)

export const request = {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return http.get<T, T>(url, config)
  },
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return http.post<T, T>(url, data, config)
  },
  patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return http.patch<T, T>(url, data, config)
  },
  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return http.put<T, T>(url, data, config)
  },
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return http.delete<T, T>(url, config)
  },
}
