import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { FINANCE_DEPARTURE_OPTIONS_QUERY_KEY } from './finance-query-keys'

describe('FINANCE_DEPARTURE_OPTIONS_QUERY_KEY', () => {
  it('shares one cached departure-options result across consumers', async () => {
    expect(FINANCE_DEPARTURE_OPTIONS_QUERY_KEY).toEqual(['finance', 'departure-options'])

    const queryClient = new QueryClient()
    const queryFn = vi.fn().mockResolvedValue([{ id: 'departure-1' }])
    const options = {
      queryKey: FINANCE_DEPARTURE_OPTIONS_QUERY_KEY,
      queryFn,
      staleTime: 60_000,
    }

    await queryClient.fetchQuery(options)
    await queryClient.fetchQuery(options)

    expect(queryFn).toHaveBeenCalledTimes(1)
  })
})
