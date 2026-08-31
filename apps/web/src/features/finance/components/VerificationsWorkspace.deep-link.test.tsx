import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as financeService from '@/services/finance.service'
import { VerificationsWorkspace } from './VerificationsWorkspace'
import type { VerificationDeepLinkSearch } from '../utils/verification-list-deep-link'

const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

const emptyVerifications = { items: [], total: 0, page: 1, pageSize: 10 }

/** Parent owns the deep-link search so tests can simulate URL changes (e.g. browser back). */
function ControlledWorkspace({
  initialSearch,
}: {
  initialSearch: VerificationDeepLinkSearch
}) {
  const [search, setSearch] = useState<VerificationDeepLinkSearch>(initialSearch)
  return (
    <>
      <button type="button" onClick={() => setSearch({})}>
        清空深链
      </button>
      <VerificationsWorkspace scope="global" deepLinkSearch={search} />
    </>
  )
}

function renderControlled(initialSearch: VerificationDeepLinkSearch) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <ControlledWorkspace initialSearch={initialSearch} />
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

function lastListParams(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.at(-1)?.[0]
}

describe('VerificationsWorkspace deep-link lock lifecycle', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    navigate.mockReset()
    vi.useRealTimers()
  })

  it('locks to exact match on entry, then resets filters when the deep link is cleared', async () => {
    const listVerifications = vi
      .spyOn(financeService, 'listVerifications')
      .mockResolvedValue(emptyVerifications)

    renderControlled({ transactionNo: 'TX-1001' })

    await waitFor(() =>
      expect(lastListParams(listVerifications)).toEqual(
        expect.objectContaining({
          transactionNo: 'TX-1001',
          transactionNoMatch: 'exact',
        }),
      ),
    )

    await userEvent.click(screen.getByRole('button', { name: '清空深链' }))

    await waitFor(() => {
      const params = lastListParams(listVerifications)
      expect(params).not.toHaveProperty('transactionNo')
      expect(params).not.toHaveProperty('transactionNoMatch')
    })
    expect((screen.getByLabelText('关联流水单号') as HTMLInputElement).value).toBe('')
  })

  it('does not reset when the user manually edits the number in locked state', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const listVerifications = vi
      .spyOn(financeService, 'listVerifications')
      .mockResolvedValue(emptyVerifications)

    renderControlled({ transactionNo: 'TX-1001' })
    await waitFor(() =>
      expect(lastListParams(listVerifications)).toEqual(
        expect.objectContaining({ transactionNoMatch: 'exact' }),
      ),
    )
    navigate.mockClear()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    // Manual edit unlocks (reducer clears lock) and clears the URL via navigate({}).
    await user.type(screen.getByLabelText('关联流水单号'), '9')
    await act(async () => void (await vi.advanceTimersByTimeAsync(300)))

    expect(navigate).toHaveBeenCalled()
    await waitFor(() => {
      const params = lastListParams(listVerifications)
      expect(params).toEqual(
        expect.objectContaining({ transactionNo: 'TX-10019' }),
      )
      expect(params).not.toHaveProperty('transactionNoMatch')
    })
    // Input retained, not wiped by the deep-link effect.
    expect((screen.getByLabelText('关联流水单号') as HTMLInputElement).value).toBe(
      'TX-10019',
    )
  })
})
