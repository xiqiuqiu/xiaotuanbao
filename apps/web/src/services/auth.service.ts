import type { LoginResult } from '@/types/api'

export interface LoginPayload {
  username: string
  password: string
}

const MOCK_USER = {
  id: 'mock-user-1',
  name: '演示用户',
  organizationId: 'mock-org-1',
  organizationName: '演示旅行社',
}

/**
 * 第一版 Mock 登录：后端 API 就绪后切换为真实接口。
 */
export async function login(payload: LoginPayload): Promise<LoginResult> {
  await new Promise((resolve) => setTimeout(resolve, 500))

  if (!payload.username.trim() || !payload.password.trim()) {
    throw new Error('请输入用户名和密码')
  }

  if (payload.password.length < 4) {
    throw new Error('密码长度不能少于 4 位')
  }

  return {
    accessToken: `mock-token-${Date.now()}`,
    user: {
      ...MOCK_USER,
      name: payload.username,
    },
  }
}

export async function logout(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 200))
}
