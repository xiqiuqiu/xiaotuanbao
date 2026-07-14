import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  requestInterceptor: vi.fn(),
  responseInterceptor: vi.fn(),
  axiosCreate: vi.fn(),
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
    },
  }
})

describe('authenticated request client', () => {
  beforeEach(() => {
    mocks.axiosGet.mockReset()
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
})
