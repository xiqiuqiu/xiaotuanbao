import { request } from '@/lib/request'
import type { LoginResult } from '@/types/api'

export interface LoginPayload {
  username: string
  password: string
}

export async function login(payload: LoginPayload): Promise<LoginResult> {
  return request.post<LoginResult>('/auth/login', payload)
}

export async function logout(): Promise<void> {
  // 第一版 JWT 无服务端会话，客户端清除 token 即可。
}
