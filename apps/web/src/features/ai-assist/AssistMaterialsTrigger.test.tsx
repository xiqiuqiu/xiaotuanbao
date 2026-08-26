import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssistMaterialsTrigger } from './AssistMaterialsTrigger'
import { listDepartureMaterials, previewDepartureMaterial } from '@/services/ai-create-task.service'

vi.mock('@/services/ai-create-task.service', () => ({
  listDepartureMaterials: vi.fn().mockResolvedValue([]),
  previewDepartureMaterial: vi.fn(),
}))

function renderTrigger(conversationId = 'conv-1') {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ConfigProvider locale={zhCN}>
        <AssistMaterialsTrigger conversationId={conversationId} />
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('AssistMaterialsTrigger', () => {
  afterEach(() => {
    cleanup()
    vi.mocked(listDepartureMaterials).mockReset()
    vi.mocked(previewDepartureMaterial).mockReset()
  })

  it('keeps materials out of the form and opens them from the assist header', async () => {
    vi.mocked(listDepartureMaterials).mockResolvedValue([
      {
        id: 'mat-1',
        originalFilename: '团期.png',
        contentType: 'image/png',
        status: 'available',
        statusVersion: 1,
        sha256: 'abc',
        sizeBytes: 12,
        createdAt: '2026-08-14T00:00:00.000Z',
        latestResultVersion: 1,
      },
    ])
    vi.mocked(previewDepartureMaterial).mockResolvedValue({
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      filename: '团期.png',
    })

    renderTrigger()

    await userEvent.click(await screen.findByRole('button', { name: '发团资料' }))
    expect(await screen.findByText('团期.png')).toBeInTheDocument()
    expect(screen.getByText('已解析')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '预览' }))
    await waitFor(() => {
      expect(previewDepartureMaterial).toHaveBeenCalledWith('conv-1', 'mat-1')
    })
    expect(await screen.findByRole('img', { name: '团期.png' })).toBeInTheDocument()
  })

  it('does not poll an empty materials list', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      vi.mocked(listDepartureMaterials).mockResolvedValue([])
      renderTrigger()
      await waitFor(() => expect(listDepartureMaterials).toHaveBeenCalledTimes(1))
      await act(async () => {
        vi.advanceTimersByTime(8_000)
      })
      expect(listDepartureMaterials).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows empty guidance, loading, and retryable errors in the panel', async () => {
    let resolveList!: (value: Awaited<ReturnType<typeof listDepartureMaterials>>) => void
    vi.mocked(listDepartureMaterials).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve
        }),
    )

    renderTrigger()
    await userEvent.click(await screen.findByRole('button', { name: '发团资料' }))
    expect(document.querySelector('.ant-spin')).toBeTruthy()

    await act(async () => {
      resolveList([])
    })
    expect(
      await screen.findByText('在对话中附上图片或 PDF 后发送，资料会出现在这里'),
    ).toBeInTheDocument()

    cleanup()
    vi.mocked(listDepartureMaterials).mockRejectedValueOnce(new Error('network'))
    renderTrigger('conv-2')
    await userEvent.click(await screen.findByRole('button', { name: '发团资料' }))
    expect(await screen.findByText('发团资料加载失败')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })

  it('previews original bytes while a material is still parsing', async () => {
    vi.mocked(listDepartureMaterials).mockResolvedValue([
      {
        id: 'mat-1',
        originalFilename: '团期.png',
        contentType: 'image/png',
        status: 'parsing',
        statusVersion: 1,
        sha256: 'abc',
        sizeBytes: 12,
        createdAt: '2026-08-14T00:00:00.000Z',
        latestResultVersion: null,
      },
    ])
    vi.mocked(previewDepartureMaterial).mockResolvedValue({
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      filename: '团期.png',
    })

    renderTrigger()
    await userEvent.click(await screen.findByRole('button', { name: '发团资料' }))
    expect(await screen.findByText('解析中')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '预览' }))
    await waitFor(() => {
      expect(previewDepartureMaterial).toHaveBeenCalledWith('conv-1', 'mat-1')
    })
    expect(await screen.findByRole('img', { name: '团期.png' })).toBeInTheDocument()
  })
})
