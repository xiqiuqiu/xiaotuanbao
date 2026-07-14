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
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

http.interceptors.request.use((config) => {
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

    const skipAuthRedirect = Boolean(
      (error.config as (AxiosRequestConfig & { skipAuthRedirect?: boolean }) | undefined)
        ?.skipAuthRedirect,
    )
    const silentError = Boolean(
      (error.config as (AxiosRequestConfig & { silentError?: boolean }) | undefined)
        ?.silentError,
    )

    if (status === 401 && !skipAuthRedirect) {
      useAuthStore.getState().clearSession()
      message.error('登录已过期，请重新登录')
      window.location.href = '/login'
      return Promise.reject(error)
    }

    if (silentError) {
      return Promise.reject(error)
    }

    const errorMessage = apiMessage || error.message || '网络异常，请稍后重试'
    message.error(errorMessage)
    return Promise.reject(error)
  },
)

export type RequestConfig = AxiosRequestConfig & {
  skipAuthRedirect?: boolean
  silentError?: boolean
}

export const request = {
  get<T>(url: string, config?: RequestConfig): Promise<T> {
    return http.get<T, T>(url, config)
  },
  post<T>(url: string, data?: unknown, config?: RequestConfig): Promise<T> {
    return http.post<T, T>(url, data, config)
  },
  patch<T>(url: string, data?: unknown, config?: RequestConfig): Promise<T> {
    return http.patch<T, T>(url, data, config)
  },
  put<T>(url: string, data?: unknown, config?: RequestConfig): Promise<T> {
    return http.put<T, T>(url, data, config)
  },
  delete<T>(url: string, config?: RequestConfig): Promise<T> {
    return http.delete<T, T>(url, config)
  },
}

export interface BinaryDownload {
  blob: Blob
  filename: string | null
}

function parseContentDispositionFilename(header: string | undefined): string | null {
  if (!header) {
    return null
  }
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim())
    } catch {
      return utf8Match[1].trim()
    }
  }
  const plainMatch = header.match(/filename="?([^";]+)"?/i)
  return plainMatch?.[1]?.trim() || null
}

async function readApiErrorFromBlob(blob: Blob): Promise<ApiError | null> {
  if (!blob.type.includes('json') && blob.type !== '' && blob.type !== 'text/plain') {
    return null
  }
  try {
    const payload = JSON.parse(await blob.text()) as ApiResponse
    if (payload && typeof payload.message === 'string') {
      return new ApiError(payload.message || '请求失败', payload.code ?? -1)
    }
  } catch {
    return null
  }
  return null
}

/** Authenticated binary download that bypasses the JSON unwrap interceptor. */
export async function downloadBinary(
  url: string,
  config?: AxiosRequestConfig,
): Promise<BinaryDownload> {
  try {
    const response = await axios.get(`${env.apiBaseUrl}${url}`, {
      ...config,
      responseType: 'blob',
      withCredentials: true,
    })
    const blob = response.data as Blob
    const jsonError = await readApiErrorFromBlob(blob)
    if (jsonError) {
      message.error(jsonError.message)
      throw jsonError
    }
    return {
      blob,
      filename: parseContentDispositionFilename(
        response.headers['content-disposition'] as string | undefined,
      ),
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      if (status === 401) {
        useAuthStore.getState().clearSession()
        message.error('登录已过期，请重新登录')
        window.location.href = '/login'
        throw error
      }
      const data = error.response?.data
      if (data instanceof Blob) {
        const jsonError = await readApiErrorFromBlob(data)
        if (jsonError) {
          message.error(jsonError.message)
          throw jsonError
        }
      }
      const apiMessage =
        error.response?.data &&
        typeof error.response.data === 'object' &&
        'message' in error.response.data
          ? String((error.response.data as ApiResponse).message)
          : null
      message.error(apiMessage || error.message || '网络异常，请稍后重试')
    }
    throw error
  }
}

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}
