import { expect, test, type Page } from '@playwright/test'
import { coordinatorUser } from '../support/credentials'
import { loginAs } from '../support/auth'

async function openSupportedDeparturePage(page: Page): Promise<string> {
  const me = await page.request.get('/api/auth/me')
  expect(me.status(), await me.text()).toBe(200)
  const ownerUserId = ((await me.json()) as { data?: { user?: { id?: string } } }).data?.user?.id
  expect(ownerUserId).toBeTruthy()

  const stamp = Date.now()
  const created = await page.request.post('/api/departures', {
    data: {
      name: `e2e371 ${stamp}`,
      routeName: `e2e371-route-${stamp}`,
      startDate: '2026-12-15',
      endDate: '2026-12-17',
      ownerUserId,
    },
    headers: { Origin: 'http://localhost:5173' },
  })
  expect(created.status(), await created.text()).toBe(201)
  const departureId = ((await created.json()) as { data?: { id?: string } }).data?.id
  expect(departureId).toBeTruthy()

  await page.goto(`/departure/${departureId}`)
  await expect(page).toHaveURL(new RegExp(`/departure/${departureId}`))
  return departureId as string
}

test.describe('agent page locator #371', () => {
  test('新会话默认带当前页面标签，发送时携带 locator', async ({ page }) => {
    await loginAs(page, coordinatorUser)
    await openSupportedDeparturePage(page)

    await page.getByRole('button', { name: '展开电子化助理' }).click()
    const pane = page.getByRole('complementary', { name: '电子化助理' })
    await expect(pane).toBeVisible()
    await expect(pane.getByTestId('current-page-chip')).toBeVisible()

    const locatorRequest = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        request.url().includes('/api/agent/conversations/messages') &&
        Boolean((request.postDataJSON() as { pageLocator?: unknown }).pageLocator),
    )
    await pane.getByRole('textbox', { name: '询问小团宝业务' }).fill(`e2e371 ${Date.now()} 带页面`)
    await pane.getByRole('textbox', { name: '询问小团宝业务' }).press('Enter')
    const attached = await locatorRequest
    expect((attached.postDataJSON() as { pageLocator?: { kind?: string } }).pageLocator?.kind).toBe(
      'departure',
    )
  })

  test('移除当前页面标签后不再发送 locator', async ({ page }) => {
    await loginAs(page, coordinatorUser)
    await openSupportedDeparturePage(page)

    await page.getByRole('button', { name: '展开电子化助理' }).click()
    const pane = page.getByRole('complementary', { name: '电子化助理' })
    await expect(pane.getByTestId('current-page-chip')).toBeVisible()
    await pane.getByRole('button', { name: '移除当前页面' }).click()
    await expect(pane.getByTestId('current-page-chip')).toHaveCount(0)
    await expect(pane.getByRole('button', { name: '获取当前页面' })).toBeVisible()

    const omittedRequest = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        request.url().includes('/api/agent/conversations/messages') &&
        (request.postDataJSON() as { pageLocator?: unknown }).pageLocator == null,
    )
    await pane.getByRole('textbox', { name: '询问小团宝业务' }).fill(`e2e371 ${Date.now()} 已移除`)
    await pane.getByRole('textbox', { name: '询问小团宝业务' }).press('Enter')
    await omittedRequest
  })

  test('历史会话不自动带页面，显式获取后才发送 locator', async ({ page }) => {
    const stamp = Date.now()
    const title = `e2e371 ${stamp} 历史显式获取`

    await loginAs(page, coordinatorUser)
    await openSupportedDeparturePage(page)
    const created = await page.request.post('/api/agent/conversations/messages', {
      data: { text: title },
      headers: {
        Origin: 'http://localhost:5173',
        'Idempotency-Key': `e2e371-history-${stamp}`,
      },
    })
    expect(created.status(), await created.text()).toBe(201)

    await page.getByRole('button', { name: '展开电子化助理' }).click()
    const pane = page.getByRole('complementary', { name: '电子化助理' })
    await pane.getByRole('button', { name: '打开会话历史' }).click()
    const history = page.getByRole('dialog', { name: '会话历史' })
    await history.getByRole('searchbox', { name: '搜索会话' }).fill(String(stamp))
    await history.getByRole('option', { name: title }).click()

    await expect(pane.getByTestId('current-page-chip')).toHaveCount(0)
    await pane.getByRole('button', { name: '获取当前页面' }).click()
    await expect(pane.getByTestId('current-page-chip')).toBeVisible()

    const locatorRequest = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        /\/api\/agent\/conversations\/[^/]+\/messages$/.test(new URL(request.url()).pathname) &&
        Boolean((request.postDataJSON() as { pageLocator?: unknown }).pageLocator),
    )
    await pane.getByRole('textbox', { name: '询问小团宝业务' }).fill('请读取当前发团')
    await pane.getByRole('textbox', { name: '询问小团宝业务' }).press('Enter')
    const captured = await locatorRequest
    expect((captured.postDataJSON() as { pageLocator?: { kind?: string } }).pageLocator?.kind).toBe(
      'departure',
    )
  })
})
