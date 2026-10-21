import { writeFile } from 'node:fs/promises'
import { expect, type APIResponse, type Page, type TestInfo } from '@playwright/test'
import type { AiConversationView, DepartureCollaborationView, ItinerarySegmentSummary, SendAiConversationMessageResult } from '../../../packages/shared/src/types/api.types'
import { createDeparture, loginCoordinator } from './collaboration'

export async function apiData<T>(response: Pick<APIResponse, 'ok' | 'url' | 'status' | 'text' | 'json'>): Promise<T> {
  expect(response.ok(), `${response.url()}: ${response.status()} ${await response.text()}`).toBe(true)
  return (await response.json()).data as T
}

export async function setupAgentConversation(page: Page, testInfo: TestInfo, suffix: string) {
  await loginCoordinator(page)
  let departureId = await createDeparture(page, `e2e-live-boundary-${suffix}`)
  const headers = { Origin: new URL(page.url()).origin }
  const segments = () => page.request.get(`/api/departures/${departureId}/segments`)
    .then(apiData<{ items: ItinerarySegmentSummary[] }>)
  const baseline = await segments()
  expect(baseline.items.length).toBeGreaterThan(1)
  const errors: unknown[] = []
  page.on('pageerror', (error) => errors.push({ kind: 'pageerror', message: error.message }))
  page.on('response', (response) => {
    if (response.url().includes('/api/agent/') && response.status() >= 400) {
      errors.push({ kind: 'http', url: response.url(), status: response.status() })
    }
  })
  let conversationId: string | undefined
  const pane = page.getByRole('complementary', { name: '电子化助理' })
  const state = () => {
    expect(conversationId).toBeTruthy()
    return page.request.get(`/api/agent/conversations/${conversationId}`).then(apiData<AiConversationView>)
  }
  const collaboration = () => page.request.get(`/api/agent/departures/${departureId}/collaboration`, {
    params: conversationId ? { conversationId } : {},
  }).then(apiData<DepartureCollaborationView>)
  const save = async (step: string) => {
    const snapshots = await Promise.allSettled([conversationId ? state() : Promise.resolve(null), collaboration(), segments()])
    const facts = {
      departureId, conversationId, errors,
      ...Object.fromEntries(snapshots.map((result, index) => [
        ['conversation', 'collaboration', 'segments'][index]!,
        result.status === 'fulfilled' ? result.value : { snapshotError: String(result.reason) },
      ])),
    }
    await writeFile(testInfo.outputPath(`${step}.json`), JSON.stringify(facts, null, 2))
    await page.screenshot({ path: testInfo.outputPath(`${step}.png`), fullPage: true, timeout: 10_000 })
    console.log(`[${suffix}] ${step}: ${departureId} ${conversationId ?? ''}`)
    return facts
  }
  const send = async (text: string) => {
    const response = page.waitForResponse((item) => item.request().method() === 'POST'
      && /\/api\/agent\/conversations(?:\/[^/]+)?\/messages$/.test(new URL(item.url()).pathname))
    await pane.getByRole('textbox', { name: '询问小团宝业务' }).fill(text)
    await pane.getByRole('button', { name: '发送', exact: true }).click()
    const sent = await apiData<SendAiConversationMessageResult>(await response)
    conversationId = sent.conversationId
    return sent
  }
  const wait = async (label: string, predicate: (view: AiConversationView) => boolean) => {
    const deadline = Date.now() + 180_000
    while (Date.now() < deadline) {
      const latest = await state()
      const failed = latest.events.filter((event) => event.kind === 'batch_status' && event.payload.status === 'failed')
      expect(failed, `${label}: ${JSON.stringify(failed)}`).toEqual([])
      if (predicate(latest)) return latest
      const latestStatus = latest.events.filter(event => event.kind === 'batch_status').at(-1)?.payload.status
      expect(latestStatus, `${label}: ${latest.pendingInteraction?.prompt ?? ''}`).not.toBe('awaiting_user_input')
      await page.waitForTimeout(1000)
    }
    throw new Error(`${label}: 180秒内未到达预期状态`)
  }
  const confirmSegment = async (doubleClick = false) => {
    await pane.getByRole('button', { name: '查看审核内容', exact: true }).last().click()
    const workspace = page.getByRole('complementary', { name: '发团协作工作区' })
    const panel = workspace.getByRole('region', { name: '行程段修改审核' })
    await expect(panel).toBeVisible()
    await save('before-confirm')
    const confirm = panel.getByRole('button', { name: '确认修改行程段' })
    if (doubleClick) await confirm.dblclick()
    else await confirm.click()
    await expect(workspace.getByRole('button', { name: '查看行程段', exact: true })).toBeVisible({ timeout: 60_000 })
    await expect.poll(async () => (await state()).events.filter(event => event.kind === 'batch_status').at(-1)?.payload.status,
      { message: '审核写入后，本批次也应退出待审核状态', timeout: 15_000 }).toBe('completed')
    await save('after-confirm')
    await workspace.getByRole('button', { name: '返回业务页面', exact: true }).first().click()
  }
  await page.goto(`/departure/${departureId}?tab=execution`)
  await page.getByRole('button', { name: '展开电子化助理' }).click()
  await pane.getByRole('button', { name: '打开会话历史' }).click()
  await page.getByRole('dialog', { name: '会话历史' }).getByRole('button', { name: '新建会话' }).click()
  const attach = pane.getByRole('button', { name: '获取当前页面' })
  if (await attach.isVisible()) await attach.click()
  await expect(pane.getByTestId('current-page-chip')).toBeVisible()
  console.log(`测试团：${new URL(page.url()).origin}/departure/${departureId}`)
  return { get departureId() { return departureId }, setDepartureId: (id: string) => { departureId = id }, headers, baseline, pane, state, segments, collaboration, save, send, wait, confirmSegment }
}
