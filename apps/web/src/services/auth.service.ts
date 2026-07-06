import { request } from '@/lib/request'
import type { LoginResult, MeResult } from '@/types/api'

export interface LoginPayload {
  username: string
  password: string
}

export async function login(payload: LoginPayload): Promise<LoginResult> {
  return request.post<LoginResult>('/auth/login', payload)
}

export async function getMe(): Promise<MeResult> {
  return request.get<MeResult>('/auth/me')
}
