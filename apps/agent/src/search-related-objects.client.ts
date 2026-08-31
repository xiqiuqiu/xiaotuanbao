import type {
  SearchPartnersInput,
  SearchPartnersOutput,
  SearchSuppliersInput,
  SearchSuppliersOutput,
  SearchUsersInput,
  SearchUsersOutput,
} from '@xiaotuanbao/ai-contracts'
import {
  searchPartnersOutputSchema,
  searchSuppliersOutputSchema,
  searchUsersOutputSchema,
} from '@xiaotuanbao/ai-contracts'
import { mapAgentFetchError } from './map-agent-error'

export interface SearchRelatedObjectsClientOptions {
  apiBaseUrl: string
  serviceSecret: string
  delegationToken: string
}

async function postRelatedSearch(
  options: SearchRelatedObjectsClientOptions,
  path: string,
  input: unknown,
): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${options.apiBaseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Service-Key': options.serviceSecret,
        Authorization: `Bearer ${options.delegationToken}`,
      },
      body: JSON.stringify(input),
    })
  } catch {
    throw mapAgentFetchError(new Error('network'))
  }

  const payload = (await response.json().catch(() => null)) as {
    data?: unknown
    message?: string
  } | null

  if (!response.ok) {
    throw mapAgentFetchError(payload?.data ?? { status: response.status })
  }

  return payload?.data
}

export async function searchUsers(
  options: SearchRelatedObjectsClientOptions,
  input: SearchUsersInput,
): Promise<SearchUsersOutput> {
  return searchUsersOutputSchema.parse(
    await postRelatedSearch(options, '/api/ai-tools/v1/search-users', input),
  )
}

export async function searchSuppliers(
  options: SearchRelatedObjectsClientOptions,
  input: SearchSuppliersInput,
): Promise<SearchSuppliersOutput> {
  return searchSuppliersOutputSchema.parse(
    await postRelatedSearch(options, '/api/ai-tools/v1/search-suppliers', input),
  )
}

export async function searchPartners(
  options: SearchRelatedObjectsClientOptions,
  input: SearchPartnersInput,
): Promise<SearchPartnersOutput> {
  return searchPartnersOutputSchema.parse(
    await postRelatedSearch(options, '/api/ai-tools/v1/search-partners', input),
  )
}
