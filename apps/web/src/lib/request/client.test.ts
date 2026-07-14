import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosError } from 'axios'

const mocks = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  requestInterceptor: vi.fn(),
  responseInterceptor: vi.fn(),
  axiosCreate: vi.fn(),
  messageError: vi.fn(),
}))

vi.mock('antd', () => ({
  message: {
    error: mocks.messageError,
  },
}))

vi.mock('axios', () => {
  const instance = {
    interceptors: {
      request: { use: mocks.requestInterceptor },
      response: { use: mocks.responseInterceptor },
    },
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  }
  mocks.axiosCreate.mockReturnValue(instance)
  return {
    default: {
      create: mocks.axiosCreate,
      get: mocks.axiosGet,
      isAxiosError: vi.fn(() => false),
      isCancel: (error: { code?: string }) => error?.code === 'ERR_CANCELED',
    },
  }
})

describe('authenticated request client', () => {
  beforeEach(() => {
    mocks.axiosGet.mockReset()
    mocks.messageError.mockReset()
  })

  it('uses browser credentials and never injects an Authorization header', async () => {
    await import('./client')

    expect(mocks.axiosCreate).toHaveBeenCalledWith(
      expect.objectContaining({ withCredentials: true }),
    )
    const requestHandler = mocks.requestInterceptor.mock.calls[0]?.[0] as (
      config: Record<string, unknown>,
    ) => Record<string, unknown>
    const config = requestHandler({ url: '/auth/me', method: 'get', headers: {} })
    expect(config.headers).not.toHaveProperty('Authorization')
  })

  it('sends credentials for binary downloads without a Bearer header', async () => {
    mocks.axiosGet.mockResolvedValue({
      data: new Blob(['content'], { type: 'application/octet-stream' }),
      headers: {},
    })
    const { downloadBinary } = await import('./client')

    await downloadBinary('/finance/export')

    expect(mocks.axiosGet).toHaveBeenCalledWith(
      expect.stringContaining('/finance/export'),
      expect.objectContaining({ withCredentials: true, responseType: 'blob' }),
    )
    expect(mocks.axiosGet.mock.calls[0]?.[1]?.headers).toBeUndefined()
  })

  it('does not toast when a request is aborted (axios canceled)', async () => {
    await import('./client')

    const errorHandler = mocks.responseInterceptor.mock.calls[0]?.[1] as (
      error: AxiosError,
    ) => Promise<unknown>

    const canceledError = {
      message: 'canceled',
      name: 'CanceledError',
      code: 'ERR_CANCELED',
      isAxiosError: true,
      config: { url: '/finance/receivables' },
      toJSON: () => ({}),
    } as AxiosError

    await expect(errorHandler(canceledError)).rejects.toBe(canceledError)
    expect(mocks.messageError).not.toHaveBeenCalled()
  })

  it('does not toast when a binary download is aborted', async () => {
    const canceledError = {
      message: 'canceled',
      name: 'CanceledError',
      code: 'ERR_CANCELED',
      isAxiosError: true,
      config: { url: '/finance/export' },
      toJSON: () => ({}),
    }
    mocks.axiosGet.mockRejectedValue(canceledError)
    const { downloadBinary } = await import('./client')

    await expect(downloadBinary('/finance/export')).rejects.toBe(canceledError)
    expect(mocks.messageError).not.toHaveBeenCalled()
  })

  it('login 401 with skipAuthRedirect rejects with API reason (disabled account)', async () => {
    await import('./client')

    const errorHandler = mocks.responseInterceptor.mock.calls[0]?.[1] as (
      error: AxiosError,
    ) => Promise<unknown>

    const disabledLoginError = {
      message: 'Request failed with status code 401',
      name: 'AxiosError',
      isAxiosError: true,
      config: { url: '/auth/login', skipAuthRedirect: true },
      response: {
        status: 401,
        data: { code: 401, message: '账号已停用', data: null },
      },
      toJSON: () => ({}),
    } as AxiosError

    await expect(errorHandler(disabledLoginError)).rejects.toMatchObject({
      name: 'ApiError',
      message: '账号已停用',
      code: 401,
    })
    expect(mocks.messageError).toHaveBeenCalledWith('账号已停用')
  })

  it('authenticated 401 preserves API disable reason before redirect', async () => {
    await import('./client')
    const errorHandler = mocks.responseInterceptor.mock.calls[0]?.[1] as (
      error: AxiosError,
    ) => Promise<unknown>

    const disabledSessionError = {
      message: 'Request failed with status code 401',
      name: 'AxiosError',
      isAxiosError: true,
      config: { url: '/users' },
      response: {
        status: 401,
        data: { code: 401, message: '账号已停用', data: null },
      },
      toJSON: () => ({}),
    } as AxiosError

    await expect(errorHandler(disabledSessionError)).rejects.toMatchObject({
      name: 'ApiError',
      message: '账号已停用',
      code: 401,
    })
    expect(mocks.messageError).toHaveBeenCalledWith('账号已停用')
  })
})

