import { request } from '@/lib/request'
import type { RequestConfig } from '@/lib/request/client'
import type { LoginResult, MeResult } from '@/types/api'

export interface LoginPayload {
  username: string
  password: string
}

export async function login(payload: LoginPayload): Promise<LoginResult> {
  return request.post<LoginResult>('/auth/login', payload, { skipAuthRedirect: true })
}

export async function getMe(config?: RequestConfig): Promise<MeResult> {
  return request.get<MeResult>('/auth/me', config)
}

export async function logout(): Promise<void> {
  return request.post<void>('/auth/logout', undefined, {
    skipAuthRedirect: true,
    silentError: true,
  })
}
