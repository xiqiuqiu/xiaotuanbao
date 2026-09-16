import { expect, type Locator, type Page, type Route } from '@playwright/test'
import { coordinatorUser } from './credentials'
import { loginAs } from './auth'

export type CollaborationFixture = {
  conversations: Array<{ id: string; title: string; lastActivityAt?: string }>
  items: unknown[]
  confirmations: unknown[]
}

function apiOk(data: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 0, message: 'ok', data }),
  }
}

export function candidate(
  fieldKey: string,
  proposedValue: unknown,
  extras?: {
    clarity?: 'clear' | 'needs_confirmation' | 'undetermined'
    evidence?: Array<Record<string, unknown>>
    status?: string
  },
) {
  return {
    fieldKey,
    proposedValue,
    clarity: extras?.clarity ?? 'clear',
    status: extras?.status ?? 'pending',
    evidence: extras?.evidence ?? [],
  }
}

export function reviewPackage(input: {
  id: string
  payloadSchema: string
  confirmationUnit: string
  status?: string
  candidates: ReturnType<typeof candidate>[]
  extras?: Record<string, unknown>
}) {
  return {
    id: input.id,
    status: input.status ?? 'pending',
    confirmationUnit: input.confirmationUnit,
    payloadSchema: input.payloadSchema,
    schemaSupported: true,
    baseObjectVersion: 1,
    version: 1,
    runId: 'run-e2e',
    conversationId: 'conv-e2e',
    inputBatchId: 'batch-e2e',
    attemptId: 'attempt-e2e',
    capabilityKey: 'e2e.fixture',
    capabilityVersion: 1,
    targetKind: 'departure',
    targetId: 'dep-e2e',
    proposalHash: 'a'.repeat(64),
    baselineSnapshot: {},
    candidates: input.candidates,
    ...input.extras,
  }
}

export async function createDeparture(page: Page, namePrefix: string): Promise<string> {
  const me = await page.request.get('/api/auth/me')
  expect(me.status(), await me.text()).toBe(200)
  const ownerUserId = ((await me.json()) as { data?: { user?: { id?: string } } }).data?.user?.id
  expect(ownerUserId).toBeTruthy()

  const stamp = Date.now()
  const created = await page.request.post('/api/departures', {
    data: {
      name: `${namePrefix} ${stamp}`,
      routeName: `${namePrefix}-route-${stamp}`,
      startDate: '2026-12-15',
      endDate: '2026-12-17',
      ownerUserId,
    },
    headers: { Origin: 'http://localhost:5173' },
  })
  expect(created.status(), await created.text()).toBe(201)
  const departureId = ((await created.json()) as { data?: { id?: string } }).data?.id
  expect(departureId).toBeTruthy()
  return departureId as string
}

export async function createConversation(
  page: Page,
  title: string,
  idempotencyKey: string,
): Promise<string> {
  const created = await page.request.post('/api/agent/conversations/messages', {
    data: { text: title },
    headers: {
      Origin: 'http://localhost:5173',
      'Idempotency-Key': idempotencyKey,
    },
  })
  expect(created.status(), await created.text()).toBe(201)
  const conversationId = ((await created.json()) as { data?: { conversationId?: string } }).data
    ?.conversationId
  expect(conversationId).toBeTruthy()
  return conversationId as string
}

export async function mockDepartureCollaboration(
  page: Page,
  departureId: string,
  fixture: CollaborationFixture | (() => CollaborationFixture),
): Promise<void> {
  await page.route(`**/api/agent/departures/${departureId}/collaboration**`, async (route: Route) => {
    const body = typeof fixture === 'function' ? fixture() : fixture
    await route.fulfill(
      apiOk({
        departureId,
        conversations: body.conversations.map((entry) => ({
          lastActivityAt: entry.lastActivityAt ?? new Date().toISOString(),
          ...entry,
        })),
        items: body.items,
        confirmations: body.confirmations,
      }),
    )
  })
}

export async function openDepartureCollaborationWorkspace(
  page: Page,
  departureId: string,
  conversationTitle: string,
  stamp: string | number,
): Promise<Locator> {
  await page.goto(`/departure/${departureId}`)
  await expect(page).toHaveURL(new RegExp(`/departure/${departureId}`))

  const workspace = page.getByRole('complementary', { name: '发团协作工作区' })
  if (await workspace.isVisible().catch(() => false)) {
    return workspace
  }

  const assist = page.getByRole('complementary', { name: '电子化助理' })
  if (!(await assist.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: '展开电子化助理' }).click()
  }
  await expect(assist).toBeVisible()

  const historyTrigger = assist.getByRole('button', { name: '打开会话历史' })
  if (await historyTrigger.isVisible().catch(() => false)) {
    await historyTrigger.click()
    const history = page.getByRole('dialog', { name: '会话历史' })
    await history.getByRole('searchbox', { name: '搜索会话' }).fill(String(stamp))
    await history.getByRole('option', { name: conversationTitle }).click()
  }

  await assist.getByRole('button', { name: '展开协作工作区', exact: true }).click()
  await expect(workspace).toBeVisible()
  return workspace
}

export async function loginCoordinator(page: Page): Promise<void> {
  await loginAs(page, coordinatorUser)
}
